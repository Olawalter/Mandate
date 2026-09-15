"""Write docs/app-e2e.json: what the in-app E2E run left on chain, read back from StudioNet.

    python scripts/record_app_e2e.py <contract> <mandate_id> <tx_hash> [<tx_hash> ...]

For each transaction: GenLayer status, consensus result, votes and leader execution result.
For the mandate: current terms and every decision receipt under it, read from LATEST_FINAL
state. Nothing is taken from the browser session except the list of transaction hashes.
"""
import pathlib
import sys

_HERE = pathlib.Path(__file__).resolve().parent
sys.path[:] = [p for p in sys.path if pathlib.Path(p or ".").resolve() != _HERE]

import json  # noqa: E402
import time  # noqa: E402
import urllib.request  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
RPC = "https://studio.genlayer.com/api"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json", "User-Agent": UA})
    out = json.load(urllib.request.urlopen(req, timeout=120))
    if "error" in out:
        raise SystemExit(f"RPC error from {method}: {out['error']}")
    return out["result"]


def main() -> int:
    contract, mandate_id, hashes = sys.argv[1], sys.argv[2], sys.argv[3:]
    from eth_account import Account
    from genlayer_py import create_client
    from genlayer_py.chains import studionet
    from genlayer_py.types import TransactionHashVariant

    client = create_client(chain=studionet, account=Account.create())

    def view(fn, *a):
        return client.read_contract(address=contract, function_name=fn, args=list(a),
                                    transaction_hash_variant=TransactionHashVariant.LATEST_FINAL)

    txs = []
    for h in hashes:
        t = rpc("eth_getTransactionByHash", [h]) or {}
        votes = (t.get("consensus_data") or {}).get("votes") or {}
        leader = ((t.get("consensus_data") or {}).get("leader_receipt") or [{}])
        leader = leader[0] if isinstance(leader, list) else leader
        txs.append({"hash": h, "from": t.get("from_address"), "status": t.get("status"),
                    "consensus": t.get("result_name"), "execution": leader.get("execution_result"),
                    "votes": sorted(votes.values()) if isinstance(votes, dict) else votes,
                    "created_at": t.get("created_at")})
    requests = view("list_mandate_requests", mandate_id, 0, 50)["items"]
    record = {
        "network": "GenLayer StudioNet", "chain_id": studionet.id, "contract": contract,
        "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "wallet": "E2E test harness: an EIP-6963 provider injected into the page, throwaway key, faucet-funded",
        "mandate": view("get_mandate", mandate_id),
        "receipts": [view("get_decision_receipt", r["request_id"]) for r in reversed(requests)],
        "transactions": txs,
    }
    out = ROOT / "docs" / "app-e2e.json"
    out.write_text(json.dumps(record, indent=2, default=str) + "\n", encoding="utf-8")
    for t in txs:
        print(f"{t['hash'][:12]}  {t['status']:<10} {t['consensus']:<16} {t['execution']}")
    for r in record["receipts"]:
        q = r["request"]
        print(f"request {q['request_id']}: {q['decision']} {q['reason_code']} material_change={q['material_change']} snapshot={q['snapshot_id']}")
    print(f"wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
