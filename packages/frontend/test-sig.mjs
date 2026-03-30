import { createPublicClient, http, verifyMessage } from "viem";
import { baseSepolia } from "viem/chains";

const message = "Amini Verification\nAction: Register Organization\nWallet: 0xb965f3a78fd25d396ae760162d3ac846873be4d6\nTimestamp: 1774404704";
const signature = "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000004185eb9dac93cd8306441655e7b190314e8a78c998d2614c283d8988924379c35d2470c778b5c286afd897f19da81eabfcd884160064cbb7c288847df32a7e99d81b00000000000000000000000000000000000000000000000000000000000000";
const address = "0xb965f3a78fd25d396ae760162d3ac846873be4d6";

const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org")
});

import { decodeAbiParameters } from "viem";

async function main() {
    try {
        console.log("Checking if wallet is deployed...");
        const code = await publicClient.getBytecode({ address });
        console.log("Deployed?", code !== undefined && code !== "0x");

        console.log("Verifying signature via viem verifyMessage()...");
        let valid = await publicClient.verifyMessage({
            address,
            message,
            signature
        });
        console.log("Valid natively?", valid);
        
        if (!valid) {
            console.log("Trying to unwrap ABI-encoded signature...");
            try {
                const decoded = decodeAbiParameters(
                    [{ type: "bytes" }],
                    signature
                )[0];
                console.log("Unwrapped signature length:", decoded.length);
                
                valid = await publicClient.verifyMessage({
                    address,
                    message,
                    signature: decoded
                });
                console.log("Valid after unwrapping?", valid);
            } catch (e) {
                console.log("Not a simple ABI encoded bytes");
            }
        }
    } catch (e) {
        console.error("Error verifying:", e);
    }
}
main();
