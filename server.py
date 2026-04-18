#!/usr/bin/env python3
import os, json, httpx, logging
from mcp.server.models import InitializationOptions
from mcp.server import NotificationOptions, Server
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.requests import Request
from starlette.responses import Response
import uvicorn
import mcp.types as types

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "")
API_VERSION = "v19.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

AD_ACCOUNTS = {
    "modest_forever": "act_974369697398252",
    "mdst": "act_1657987061886237",
    "mosworld": "act_1591702788555265",
    "mosworld_fit": "act_1677823153559606",
    "seller_dummy": "act_315361678074856",
}

server = Server("meta-ads-unified")

def meta_get(endpoint: str, params: dict = None) -> dict:
    if params is None:
        params = {}
    params["access_token"] = ACCESS_TOKEN
    url = f"{BASE_URL}/{endpoint}"
    with httpx.Client() as client:
        response = client.get(url, params=params, timeout=30)
        return response.json()

def get_all_accounts_overview(date_preset: str) -> dict:
    results = {}
    for key, account_id in AD_ACCOUNTS.items():
        try:
            data = meta_get(f"{account_id}/insights", {
                "date_preset": date_preset,
                "fields": "spend,impressions,clicks,ctr,cpc,reach,actions,action_values"
            })
            results[key] = {"account_id": account_id, "data": data.get("data", []), "error": data.get("error")}
        except Exception as e:
            results[key] = {"account_id": account_id, "data": [], "error": str(e)}
    return results

def get_campaign_performance(account_id: str, date_preset: str, campaign_id: str = None) -> dict:
    if campaign_id:
        return meta_get(f"{campaign_id}/insights", {
            "date_preset": date_preset,
            "fields": "campaign_name,spend,impressions,clicks,ctr,cpc,cpp,reach,frequency,actions,action_values"
        })
    return meta_get(f"{account_id}/insights", {
        "date_preset": date_preset,
        "level": "campaign",
        "fields": "campaign_name,spend,impressions,clicks,ctr,cpc,cpp,reach,frequency,actions,action_values"
    })

def get_ad_performance(account_id: str, date_preset: str) -> dict:
    return meta_get(f"{account_id}/insights", {
        "date_preset": date_preset,
        "level": "ad",
        "fields": "ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,reach,actions,action_values",
        "sort": "spend_descending",
        "limit": "20"
    })

def get_campaigns(account_id: str) -> dict:
    return meta_get(f"{account_id}/campaigns", {
        "fields": "id,name,status,objective,daily_budget,lifetime_budget",
        "limit": "50"
    })

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(name="get_all_accounts_overview", description="Get performance across ALL ad accounts in one call.",
            inputSchema={"type":"object","properties":{"date_preset":{"type":"string","enum":["today","yesterday","last_7d","last_14d","last_30d","last_90d","this_month","last_month"]}},"required":["date_preset"]}),
        types.Tool(name="get_campaign_performance", description="Get campaign-level performance for a specific account.",
            inputSchema={"type":"object","properties":{"account":{"type":"string","enum":["modest_forever","mdst","mosworld","mosworld_fit","seller_dummy"]},"date_preset":{"type":"string","enum":["today","yesterday","last_7d","last_14d","last_30d","last_90d","this_month","last_month"]},"campaign_id":{"type":"string"}},"required":["account","date_preset"]}),
        types.Tool(name="get_ad_performance", description="Get top 20 ads by spend for a specific account.",
            inputSchema={"type":"object","properties":{"account":{"type":"string","enum":["modest_forever","mdst","mosworld","mosworld_fit","seller_dummy"]},"date_preset":{"type":"string","enum":["today","yesterday","last_7d","last_14d","last_30d","last_90d","this_month","last_month"]}},"required":["account","date_preset"]}),
        types.Tool(name="get_campaigns", description="List all campaigns with status and budget.",
            inputSchema={"type":"object","properties":{"account":{"type":"string","enum":["modest_forever","mdst","mosworld","mosworld_fit","seller_dummy"]}},"required":["account"]}),
        types.Tool(name="pause_campaign", description="Pause a campaign by ID.",
            inputSchema={"type":"object","properties":{"campaign_id":{"type":"string"}},"required":["campaign_id"]}),
        types.Tool(name="pause_ad", description="Pause an ad by ID.",
            inputSchema={"type":"object","properties":{"ad_id":{"type":"string"}},"required":["ad_id"]}),
    ]

@server.call_tool()
async def handle_call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    try:
        if name == "get_all_accounts_overview":
            data = get_all_accounts_overview(arguments["date_preset"])
        elif name == "get_campaign_performance":
            account_id = AD_ACCOUNTS[arguments["account"]]
            data = get_campaign_performance(account_id, arguments["date_preset"], arguments.get("campaign_id"))
        elif name == "get_ad_performance":
            account_id = AD_ACCOUNTS[arguments["account"]]
            data = get_ad_performance(account_id, arguments["date_preset"])
        elif name == "get_campaigns":
            account_id = AD_ACCOUNTS[arguments["account"]]
            data = get_campaigns(account_id)
        elif name == "pause_campaign":
            with httpx.Client() as client:
                r = client.post(f"{BASE_URL}/{arguments['campaign_id']}", data={"status":"PAUSED","access_token":ACCESS_TOKEN})
                data = r.json()
        elif name == "pause_ad":
            with httpx.Client() as client:
                r = client.post(f"{BASE_URL}/{arguments['ad_id']}", data={"status":"PAUSED","access_token":ACCESS_TOKEN})
                data = r.json()
        else:
            data = {"error": f"Unknown tool: {name}"}
        return [types.TextContent(type="text", text=json.dumps(data, indent=2))]
    except Exception as e:
        return [types.TextContent(type="text", text=f"Error: {str(e)}")]

sse = SseServerTransport("/messages/")

async def handle_sse(request: Request):
    async with sse.connect_sse(request.scope, request.receive, request._send) as streams:
        await server.run(streams[0], streams[1], InitializationOptions(
            server_name="meta-ads-unified", server_version="1.0.0",
            capabilities=server.get_capabilities(notification_options=NotificationOptions(), experimental_capabilities={})
        ))

async def handle_messages(request: Request):
    await sse.handle_post_message(request.scope, request.receive, request._send)

app = Starlette(routes=[
    Route("/sse", endpoint=handle_sse),
    Route("/messages/", endpoint=handle_messages, methods=["POST"]),
])

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
