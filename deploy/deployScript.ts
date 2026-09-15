/**
 * Deploy contracts/mandate.py — run by the GenLayer CLI:
 *
 *   genlayer network studionet
 *   genlayer deploy            # executes this file with the CLI's configured account
 *
 * Follows the official boilerplate's convention (a default export that receives the CLI's
 * GenLayerClient), then goes further: it reads back the code GenLayer stored and refuses to
 * report success unless it is byte-identical to the file and answers as MANDATE.
 * Record the deployment with: python scripts/inspect.py <address> --write-deployment
 * (scripts/deploy.py does the same from Python with an ephemeral, faucet-funded key.)
 */
import { readFileSync } from "fs";
import path from "path";

import { localnet } from "genlayer-js/chains";
import {
  TransactionStatus,
  transactionsStatusNumberToName,
  type DecodedDeployData,
  type GenLayerChain,
  type GenLayerClient,
  type TransactionHash,
} from "genlayer-js/types";

export default async function main(client: GenLayerClient<GenLayerChain>) {
  const filePath = path.resolve(process.cwd(), "contracts/mandate.py");
  const code = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

  const hash = (await client.deployContract({ code, args: [] })) as TransactionHash;
  console.log(`deployment transaction ${hash}`);

  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, retries: 200 });
  // The CLI's bundled genlayer-js reports a numeric status without statusName; accept either form.
  const status = receipt.statusName ?? transactionsStatusNumberToName[String(receipt.status) as keyof typeof transactionsStatusNumberToName];
  if (status !== "ACCEPTED" && status !== "FINALIZED") {
    throw new Error(`Deployment was not accepted: ${status ?? receipt.status}`);
  }

  const fromData = (receipt.data as { contract_address?: string } | undefined)?.contract_address;
  const address = (
    (client.chain as GenLayerChain).id === localnet.id
      ? fromData
      : (fromData ?? (receipt.txDataDecoded as DecodedDeployData | undefined)?.contractAddress)
  ) as `0x${string}` | undefined;
  if (!address) throw new Error("The deployment was accepted but carries no contract address.");

  // getContractCode already decodes gen_getContractCode's base64 into text
  const stored = await client.getContractCode(address);
  if (stored !== code) throw new Error(`The code stored at ${address} differs from contracts/mandate.py.`);

  const info = (await client.readContract({ address, functionName: "get_protocol_info", args: [], jsonSafeReturn: true })) as {
    protocol_version?: string;
  };
  if (!info.protocol_version?.startsWith("MANDATE")) throw new Error(`${address} does not answer as MANDATE.`);

  console.log(`Contract deployed at address: ${address}`);
  console.log(`verified byte-identical to contracts/mandate.py, ${info.protocol_version}`);
  console.log(`frontend: NEXT_PUBLIC_MANDATE_CONTRACT=${address}`);
}
