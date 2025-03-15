import axios from "axios";
import qs from "qs";

export function createBattleMetricsClient(config) {
  const orgId = config.org_id;
  const http = axios.create({
    baseURL: "https://api.battlemetrics.com",
    headers: {
      Authorization: `Bearer ${config.access_token}`,
    },
  });

  return {
    async userSteamId(userId) {
      const url = `/organizations/${orgId}?include=organizationUser`;
      try {
        const response = await http.get(url);
        const included = response.data.included;
        if (Array.isArray(included)) {
          for (const orgUser of included) {
            if (orgUser.relationships?.user?.data?.id === userId) {
              if (
                orgUser.attributes &&
                Array.isArray(orgUser.attributes.identifiers) &&
                orgUser.attributes.identifiers.length > 0
              ) {
                return orgUser.attributes.identifiers[0].identifier;
              }
            }
          }
        }
        console.log("userSteamId: No player for requested userId", userId);
        return undefined;
      } catch (error) {
        console.log(`userSteamId error: ${error.message}`);
        return undefined;
      }
    },

    async playerBySteamId(steamId) {
      const url = "/players/match";
      const body = {
        data: [
          {
            type: "identifier",
            attributes: {
              type: "steamID",
              identifier: steamId,
            },
          },
        ],
      };
      try {
        const response = await http.post(url, body);
        if (response.data.data && response.data.data.length > 0) {
          return response.data.data[0];
        }
        console.log(
          "playerBySteamId: No player for requested steamID",
          steamId
        );
        return undefined;
      } catch (error) {
        console.log(`playerBySteamId error: ${error.message}`);
        return undefined;
      }
    },

    async playerBans(steamId) {
      const params = {
        "page[size]": 10,
        "filter[expired]": false,
        "filter[organization]": orgId,
        "filter[search]": steamId,
      };
      const queryString = qs.stringify(params);
      const url = `/bans?${queryString}`;
      try {
        const response = await http.get(url);
        if (response.data.data && response.data.meta.total > 0) {
          return response.data.data;
        }
        return [];
      } catch (error) {
        console.log(`playerBans error: ${error.message}`);
        return [];
      }
    },
  };
}
