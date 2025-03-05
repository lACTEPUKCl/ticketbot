import { VK } from "vk-io";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";

function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Ошибка удаления файла (${filePath}):`, err);
  }
}

export async function uploadVideoToVKCommunity(
  videoFilePath,
  title,
  description
) {
  const vk = new VK({ token: process.env.VK_TOKEN });

  const saveResponse = await vk.api.video.save({
    name: title,
    description: description,
    group_id: process.env.VK_GROUP_ID,
  });
  if (saveResponse.error)
    throw new Error(
      `VK API error (video.save): ${JSON.stringify(saveResponse.error)}`
    );

  const uploadUrl = saveResponse.upload_url;
  if (!uploadUrl)
    throw new Error("Не удалось получить URL для загрузки видео.");

  const form = new FormData();
  form.append("video_file", fs.createReadStream(videoFilePath));

  const uploadResponse = await axios.post(uploadUrl, form, {
    headers: form.getHeaders(),
    responseType: "text",
  });

  let uploadData;
  try {
    uploadData = JSON.parse(uploadResponse.data);
  } catch (err) {
    throw new Error(
      "Видео: Ответ от сервера загрузки не является корректным JSON."
    );
  }

  let finalizeParams = { group_id: process.env.VK_GROUP_ID };
  if (uploadData.video_file) {
    finalizeParams.video_file = uploadData.video_file;
  } else if (uploadData.video_hash && uploadData.video_id) {
    finalizeParams.video_hash = uploadData.video_hash;
    finalizeParams.video_id = uploadData.video_id;
  } else {
    throw new Error(
      "Видео: В ответе загрузки отсутствуют необходимые параметры."
    );
  }

  const finalizeResponse = await vk.api.video.save(finalizeParams);
  if (finalizeResponse.error)
    throw new Error(
      `VK API error при финализации видео: ${JSON.stringify(
        finalizeResponse.error
      )}`
    );

  const { video_id, owner_id } = finalizeResponse;
  if (!video_id || !owner_id)
    throw new Error("Видео: Не удалось получить данные о загруженном видео.");

  const finalVideoId = video_id - 1;
  const videoUrl = `https://vk.com/video${owner_id}_${finalVideoId}`;

  deleteFile(videoFilePath);
  return videoUrl;
}

export async function uploadPhotoToVK(photoFilePath) {
  const vk = new VK({ token: process.env.VK_TOKEN });

  const uploadServerResponse = await vk.api.photos.getUploadServer({
    album_id: process.env.VK_ALBUM_ID,
    group_id: process.env.VK_GROUP_ID,
  });

  if (uploadServerResponse.error)
    throw new Error(
      `VK API error (photos.getUploadServer): ${JSON.stringify(
        uploadServerResponse.error
      )}`
    );

  const uploadUrl = uploadServerResponse.upload_url;
  if (!uploadUrl) throw new Error("Не удалось получить URL для загрузки фото.");

  const form = new FormData();
  form.append("file1", fs.createReadStream(photoFilePath));

  const uploadResponse = await axios.post(uploadUrl, form, {
    headers: form.getHeaders(),
    responseType: "json",
  });
  const uploadData = uploadResponse.data;
  const saveResponse = await vk.api.photos.save({
    album_id: process.env.VK_ALBUM_ID,
    group_id: process.env.VK_GROUP_ID,
    photos_list: uploadData.photos_list,
    server: uploadData.server,
    hash: uploadData.hash,
  });

  if (saveResponse.error)
    throw new Error(
      `VK API error (photos.save): ${JSON.stringify(saveResponse.error)}`
    );
  if (!saveResponse[0])
    throw new Error("Фото: Не удалось сохранить фотографию.");

  const photoData = saveResponse[0];
  const photoUrl = `https://vk.com/photo${photoData.owner_id}_${photoData.id}`;

  deleteFile(photoFilePath);
  return photoUrl;
}

export async function uploadDocumentToVK(
  docFilePath,
  title,
  type = "application/octet-stream"
) {
  const vk = new VK({ token: process.env.VK_TOKEN });

  const uploadServerResponse = await vk.api.docs.getUploadServer();
  if (!uploadServerResponse.upload_url)
    throw new Error("Не удалось получить URL для загрузки документа.");

  const form = new FormData();
  form.append("file", fs.createReadStream(docFilePath));

  const uploadResponse = await axios.post(
    uploadServerResponse.upload_url,
    form,
    { headers: form.getHeaders(), responseType: "json" }
  );
  const uploadData = uploadResponse.data;

  const saveResponse = await vk.api.docs.save({
    file: uploadData.file,
    title: title,
    privacy_view: ["all"],
  });

  if (!saveResponse.doc)
    throw new Error("Документ: Не удалось сохранить документ.");

  const docData = saveResponse.doc;
  const docUrl = `https://vk.com/doc${docData.owner_id}_${docData.id}`;

  deleteFile(docFilePath);
  return docUrl;
}

export async function uploadAttachmentToVK(filePath, fileType, options = {}) {
  let uploadedUrl = null;
  try {
    switch (fileType) {
      case "video":
        uploadedUrl = await uploadVideoToVKCommunity(
          filePath,
          options.title || "Видео от бота",
          options.description || ""
        );
        break;
      case "photo":
        uploadedUrl = await uploadPhotoToVK(filePath);
        break;
      case "doc":
        uploadedUrl = await uploadDocumentToVK(
          filePath,
          options.title || "Документ от бота",
          options.type
        );
        break;
      default:
        throw new Error(`Неподдерживаемый тип файла: ${fileType}`);
    }
  } catch (err) {
    console.error("Ошибка загрузки файла в VK:", err);
  } finally {
    deleteFile(filePath);
  }
  return uploadedUrl;
}
