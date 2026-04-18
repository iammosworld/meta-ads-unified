import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const API_VERSION = "v19.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

const AD_ACCOUNTS = {
  modest_forever: { id: "act_974369697398252", name: "Modest Forever" },
  mdst: { id: "act_1657987061886237", name: "MDST Athletics" },
  mosworld: { id: "act_1591702788555265", name: "MOSWORLD" },
  mosworld_fit: { id: "act_1677823153559606", name: "MOSWORLD.FIT" },
  seller_dummy: { id: "act_315361678074856", name: "Seller Dummy" },
};

async function metaGet(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("access_token", ACCESS_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  return res.json();
}

async function getAllAccountsOverview(datePreset) {
  const results = {};
  for (const [key, account] of Object.entries(AD_ACCOUNTS)) {
    try {
      const data = await metaGet(`/${account.id}/insights`, {
        date_preset: datePreset,
        fields: "spend,impressions,clicks,ctr,cpc,reach,actions,action_values",
      });
      results[key] = { name: account.name, account_id: account.id, data: data.data || [], error: data.error || null };
    } catch (e) {
      results[key] = { name: account.name, account_id: account.id, data: [], error: e.message };
    }
  }
  return results;
}

async function getCampaignPerformance(accountId, datePreset, campaignId) {
  if (campaignId) {
    return metaGet(`/${campaignId}/insights`, {
      date_preset: datePreset,
      fields: "campaign_name,spend,impressions,clicks,ctr,cpc,cpp,reach,frequency,actions,action_values",
    });
  }
  return metaGet(`/${accountId}/insights`, {
    date_preset: datePreset,
    level: "campaign",
    fields: "campaign_name,spend,impressions,clicks,ctr,cpc,cpp,reach,frequency,actions,action_values",
  });
}

async function getAdPerformance(accountId, datePreset) {
  return metaGet(`/${accountId}/insights`, {
    date_preset: datePreset,
    level: "ad",
    fields: "ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,reach,actions,action_values",
    sort: "spend_descending",
    limit: 20,
  });
}

async function getCampaigns(accountId) {
  return metaGet(`/${accountId}/campaigns`, {
    fields: "id,name,status,objective,daily_budget,lifetime_budget",
    limit: 50,
  });
}

function createMCPServer() {
  const server = new Server(
    { name: "meta-ads-unified", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_all_accounts_overview",
        description: "Get performance across ALL ad accounts in one call.",
        inputSchema: {
          type: "object",
          properties: {
            date_preset: { type: "string", enum: ["today","yesterday","last_7d","last_14d","last_30d","last_90d","this_month","last_month"] }
          },
          required: ["date_preset"]
        },
      },
      {
        name: "get_campaign_performance",
        description: "Get campaign-level performance for a specific account.",
        inputSchema: {
          type: "object",
          properties: {
            account: { type: "string", enum: ["modest_forever","mdst","mosworld","mosworld_fit","seller_dummy"] },
            date_preset: { type: "string", enum: ["today","yesterday","last_7d","last_14d","last_30d","last_90d","this_month","last_month"] },
            campaign_id: { type: "string" }
          },
          required: ["account","date_preset"]
        },
      },
      {
        name: "get_ad_performance",
        description: "Get top 20 ads by spend for a specific account.",
        inputSchema: {
          type: "object",
          properties: {
            account: { type: "string", enum: ["modest_forever","mdst","mosworld","mosworld_fit","seller_dummy"] },
            date_preset: { type: "string", enum: ["today","yesterday","last_7d","last_14d","last_30d","last_90d","this_month","last_month"] }
          },
          required: ["account","date_preset"]
        },
      },
      {
        name: "get_campaigns",
        description: "List all campaigns with status and budget.",
        inputSchema: {
          type: "object",
          properties: {
            account: { type: "string", enum: ["modest_forever","mdst","mosworld","mosworld_fit","seller_dummy"] }
          },
          required: ["account"]
        },
      },
      {
        name: "pause_campaign",
        description: "Pause a campaign by ID.",
        inputSchema: {
          type: "object",
          properties: { campaign_id: { type: "string" } },
          required: ["campaign_id"]
        },
      },
      {
        name: "pause_ad",
        description: "Pause an ad by ID.",
        inputSchema: {
          type: "object",
          properties: { ad_id: { type: "string" } },
          required: ["ad_id"]
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result;
      if (name === "get_all_accounts_overview") {
        result = await getAllAccountsOverview(args.date_preset);
      } else if (name === "get_campaign_performance") {
        const account = AD_ACCOUNTS[args.account];
        result = await getCampaignPerformance(account.id, args.date_preset, args.campaign_id);
      } else if (name === "get_ad_performance") {
        const account = AD_ACCOUNTS[args.account];
        result = await getAdPerformance(account.id, args.date_preset);
      } else if (name === "get_campaigns") {
        const account = AD_ACCOUNTS[args.account];
        result = await getCampaigns(account.id);
      } else if (name === "pause_campaign") {
        result = await fetch(`${BASE_URL}/${args.campaign_id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PAUSED", access_token: ACCESS_TOKEN }),
        }).then(r => r.json());
      } else if (name === "pause_ad") {
        result = await fetch(`${BASE_URL}/${args.ad_id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PAUSED", access_token: ACCESS_TOKEN }),
        }).then(r => r.json());
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: JSON.stringify({ error: error.message }) }], isError: true };
    }
  });

  return server;
}

const app = express();
const transports = new Map();

app.get("/sse", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const transport = new SSEServerTransport("/message", res);
  transports.set(transport.sessionId, transport);

  const server = createMCPServer();
  await server.connect(transport);

  req.on("close", () => {
    transports.delete(transport.sessionId);
  });
});

app.post("/message", express.json(), async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (!transport) return res.status(404).json({ error: "Session not found" });
  await transport.handlePostMessage(req, res);
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Meta Ads Unified MCP running on port ${PORT}`);
});
