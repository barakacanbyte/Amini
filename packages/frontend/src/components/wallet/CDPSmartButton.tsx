'use client';

import React, { useEffect } from 'react';
import { useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendTransaction, useAccount } from 'wagmi';
import { Icon } from '@coinbase/cds-web/icons';
import { Spinner } from '@coinbase/cds-web/loaders';

interface CDPSmartButtonProps {
    account: `0x${string}`;
    network: string;
    transaction: any;
    /** Chain ID for explorer link and Alchemy condition */
    chainId?: number;
    onSuccess?: (hash: string) => void;
    onError?: (error: Error) => void;
    /** If true, do not show the built-in status popup (caller handles feedback) */
    hideStatusPopup?: boolean;
    className?: string;
    children?: React.ReactNode;
}

export function CDPSmartButton({
    account,
    network,
    transaction,
    chainId,
    onSuccess,
    onError,
    hideStatusPopup = false,
    className,
    children
}: CDPSmartButtonProps) {
    const { sendUserOperation, status: cdpStatus, data: cdpData, error: cdpError } = useSendUserOperation();
    const { sendTransactionAsync, status: wagmiStatus } = useSendTransaction();
    const { currentUser } = useCurrentUser();
    const { isConnected } = useAccount();
    const [isInitiated, setIsInitiated] = React.useState(false);

    const isBase = network === 'base' || network === 'base-sepolia';
    const smartAccount = currentUser?.evmSmartAccounts?.[0];
    const isSmartWallet = !!(smartAccount && account?.toLowerCase() === smartAccount.toLowerCase());

    const useCdpPaymaster = isBase;

    const reportSuccess = (txHash: string) => {
        onSuccess?.(txHash);
    };

    const reportError = (err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
    };

    useEffect(() => {
        if (isInitiated && cdpStatus === 'success' && cdpData?.transactionHash) {
            reportSuccess(cdpData.transactionHash);
            setIsInitiated(false);
        }
    }, [cdpStatus, cdpData, isInitiated]);

    useEffect(() => {
        if (isInitiated && cdpStatus === 'error' && cdpError) {
            reportError(cdpError);
            setIsInitiated(false);
        }
    }, [cdpStatus, cdpError, isInitiated]);

    const handleSend = async () => {
        if (!smartAccount) {
            reportError(new Error('No valid smart account detected for smart account transaction'));
            return;
        }

        try {
            setIsInitiated(true);
            await sendUserOperation({
                evmSmartAccount: smartAccount,
                network: network as any,
                calls: [transaction],
                useCdpPaymaster,
            });
        } catch (err: any) {
            setIsInitiated(false);
            reportError(err);
        }
    };

    const handleWagmiSend = async () => {
        if (!transaction) return;
        try {
            setIsInitiated(true);
            const result = await sendTransactionAsync({
                to: transaction.to as `0x${string}`,
                value: transaction.value ? BigInt(transaction.value) : 0n,
                data: transaction.data as `0x${string}`,
            });
            const txHash = typeof result === 'string' ? result : (result && typeof result === 'object' && 'hash' in result ? (result as { hash: string }).hash : '');
            reportSuccess(txHash || '');
            setIsInitiated(false);
        } catch (err: any) {
            setIsInitiated(false);
            reportError(err);
        }
    };

    const isPending =
        cdpStatus === 'pending' ||
        wagmiStatus === 'pending' ||
        (isInitiated && (wagmiStatus === 'idle' || cdpStatus === 'idle'));

    return (
        <button
            type="button"
            onClick={isSmartWallet ? handleSend : handleWagmiSend}
            disabled={isPending || !transaction || !isConnected}
            className={className}
        >
            {isPending ? (
                <span className="flex items-center justify-center w-full h-full text-base font-semibold">
                    <Spinner size={3} accessibilityLabel="Processing" className="mr-2" />
                    Processing...
                </span>
            ) : (
                children
            )}
        </button>
    );
}
