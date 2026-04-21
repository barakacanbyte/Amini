"use client";

import { useState, useCallback } from "react";
import { baseSepolia } from "viem/chains";
import { Address, encodeFunctionData } from "viem";
import { useName, useAttestations } from "@coinbase/onchainkit/identity";
import { useAminiSigning } from "@/context/AminiSigningContext";
import { CDPSmartButton } from "@/components/wallet/CDPSmartButton";
import Link from "next/link";
import { Button } from "@coinbase/cds-web/buttons";
import { TextBody } from "@coinbase/cds-web/typography";
import { TextTitle1 } from "@coinbase/cds-web/typography";
import { TextCaption } from "@coinbase/cds-web/typography";
import { Banner } from "@coinbase/cds-web/banner";
import { Spinner } from "@coinbase/cds-web/loaders";
import { NativeTextArea } from "@coinbase/cds-web/controls";
import { Icon } from "@coinbase/cds-web/icons";

/** "AminiReg" in hex — the calldata marker the backend checks */
const AMINI_REG_HEX = "0x416d696e69526567";

export default function RegisterOrganizationPage() {
  const { address, isConnected, getCdpAccessToken } =
    useAminiSigning();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [officialEmail, setOfficialEmail] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [country, setCountry] = useState("");
  
  // Logo state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  
  // On-chain identity
  const { data: onchainName } = useName({ address: address as Address, chain: baseSepolia });
  const cbAttestations = useAttestations({ address: (address || "0x") as Address, chain: baseSepolia, schemaId: "0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9" });
  const hasCoinbaseVerification = address ? cbAttestations && cbAttestations.length > 0 : false;

  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"idle" | "confirming" | "submitting">("idle");
  const [result, setResult] = useState<{ ok: boolean; message?: string; orgName?: string } | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const canSubmit = isConnected && address && name.trim().length >= 3 && officialEmail.trim().length > 0 && officialEmail.includes("@") && !submitting;


  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setLogoError(null);
    if (!file) return;

    // Strict format check
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setLogoError("Invalid format. Please use JPG, PNG, or WEBP.");
      return;
    }

    // Strict size check (2MB)
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("File too large. Max size is 2MB.");
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
  }

  // Build the zero-value transaction for CDPSmartButton
  const registrationTx = address ? {
    to: address, // self-transfer
    value: "0",
    data: AMINI_REG_HEX,
  } : null;

  /**
   * Called when CDPSmartButton confirms the transaction.
   * Submits the registration form data + txHash to the backend.
   */
  const handleTxSuccess = useCallback(async (txHash: string) => {
    if (!address || !name || !officialEmail) return;

    setPhase("submitting");
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("wallet", address);
      formData.append("name", name.trim());
      formData.append("officialEmail", officialEmail.trim());
      formData.append("txHash", txHash);
      
      if (description.trim()) formData.append("description", description.trim());
      if (websiteUrl.trim()) formData.append("websiteUrl", websiteUrl.trim());
      if (twitterHandle.trim()) formData.append("twitterHandle", twitterHandle.trim());
      if (linkedinUrl.trim()) formData.append("linkedinUrl", linkedinUrl.trim());
      if (country.trim()) formData.append("country", country.trim());
      if (onchainName) formData.append("ensName", onchainName);
      formData.append("hasCoinbaseVerification", String(hasCoinbaseVerification));
      if (logoFile) formData.append("logo", logoFile);

      const cdpToken = await getCdpAccessToken();
      if (cdpToken) formData.append("cdpAccessToken", cdpToken);

      const res = await fetch("/api/organizations", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (json.ok) {
        setResult({ ok: true, orgName: name.trim() });
      } else {
        const errorMsg = res.status === 401 
          ? `Identity verification failed: ${json.message}.`
          : json.message ?? "Registration failed.";
        setResult({ ok: false, message: errorMsg });
      }
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message ?? "Network error." });
    } finally {
      setSubmitting(false);
      setPhase("idle");
    }
  }, [address, name, officialEmail, description, websiteUrl, twitterHandle, linkedinUrl, country, onchainName, hasCoinbaseVerification, logoFile, getCdpAccessToken]);

  const handleTxError = useCallback((error: Error) => {
    setSubmitting(false);
    setPhase("idle");
    setResult({ ok: false, message: `Transaction failed: ${error.message}. Please try again.` });
  }, []);

  /** Called when the user clicks the "Register" button to initiate */
  function handleRegisterClick() {
    if (!canSubmit) return;
    setResult(null);
    setPhase("confirming");
    setSubmitting(true);
    // The CDPSmartButton will handle the actual transaction
  }

  return (
    <main className="min-h-screen bg-[var(--ui-bg)] pt-16 pb-12 sm:pt-24 sm:pb-16">
      <div className="max-w-6xl mx-auto w-full px-3 sm:px-4">
        {/* Top Back Link */}
        <Link 
          href="/campaigns/create" 
          className="inline-flex items-center gap-2 app-muted hover:app-text transition-colors mb-8 lg:mb-16 font-medium text-sm"
        >
          <div className="w-4 h-4 flex items-center justify-center"><Icon name="arrowLeft" size="s" color="currentColor" /></div>
          Back to campaign creation
        </Link>

        <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-start">
          
          {/* LEFT COLUMN: HERO TEXT */}
          <div className="flex-1 lg:sticky lg:top-32 w-full">
            <TextCaption className="uppercase tracking-[0.2em] font-bold text-[var(--ui-brand-green)] mb-6 block text-xs">
              Join the Network
            </TextCaption>
            
            <TextTitle1 as="h1" className="text-[#fdfaf6] text-3xl sm:text-4xl lg:text-[3.25rem] font-bold tracking-tight m-0 block leading-[1.1]">
              Register Your <br className="hidden lg:block" /><span className="text-[var(--ui-brand-green)]">Organization</span>
            </TextTitle1>
            
            <TextBody as="p" className="text-[#a89c8e] text-base lg:text-lg mt-6 mb-12 max-w-md leading-relaxed">
              Organizations must be verified by an admin before they can create campaigns. 
              Registration is free and takes 1–2 business days.
            </TextBody>

            <div className="space-y-8 hidden md:block">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--ui-brand-green)]/10 flex items-center justify-center flex-shrink-0">
                  <span className="w-6 h-6 flex items-center justify-center text-[var(--ui-brand-green)]"><Icon name="circleCheckmark" size="m" color="currentColor" /></span>
                </div>
                <div className="pt-1">
                  <TextBody className="font-bold text-[#fdfaf6] mb-1">Verified Identity</TextBody>
                  <TextBody className="text-[#a89c8e] text-sm">We cross-reference on-chain ENS and Coinbase credentials securely.</TextBody>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--ui-brand-green)]/10 flex items-center justify-center flex-shrink-0">
                  <span className="w-6 h-6 flex items-center justify-center text-[var(--ui-brand-green)]"><Icon name="globe" size="m" color="currentColor" /></span>
                </div>
                <div className="pt-1">
                  <TextBody className="font-bold text-[#fdfaf6] mb-1">Global Reach</TextBody>
                  <TextBody className="text-[#a89c8e] text-sm">Unify your fundraising with transparent, traceable blockchain campaigns.</TextBody>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: THE FORM CARD */}
          <div className="flex-1 w-full max-w-xl mx-auto lg:mx-0">
            {/* Wallet check */}
            {!isConnected && (
              <div className="mb-6">
                <Banner
                  variant="warning"
                  startIcon="warning"
                  startIconActive
                  styleVariant="contextual"
                  borderRadius={400}
                  title="Wallet not connected"
                  style={{ padding: '0.75rem 1.25rem' }}
                >
                  Connect your wallet to register your organization.
                </Banner>
              </div>
            )}

            {/* Success */}
            {result?.ok && (
              <div className="mb-6">
                <Banner
                  variant="promotional"
                  startIcon="verifiedBadge"
                  startIconActive
                  styleVariant="contextual"
                  borderRadius={400}
                  title="Organization registered!"
                  style={{ padding: '0.75rem 1.25rem' }}
                >
                  &ldquo;{result.orgName}&rdquo; has been submitted for review. You will be able to create campaigns once an admin approves your organization.
                </Banner>
                <div className="mt-4 flex gap-3">
                  <Button as={Link} href="/campaigns/create" variant="primary" className="campaign-btn-launch [&>span]:flex [&>span]:items-center [&>span]:gap-2">
                    Back to Campaigns
                  </Button>
                </div>
              </div>
            )}

            {/* Error */}
            {result && !result.ok && (
              <div className="mb-6">
                <Banner
                  variant="error"
                  startIcon="error"
                  startIconActive
                  styleVariant="contextual"
                  borderRadius={400}
                  title="Registration failed"
                  style={{ padding: '0.75rem 1.25rem' }}
                >
                  {result.message}
                </Banner>
              </div>
            )}

            {/* Registration form */}
            {!result?.ok && (
              <div className="rounded-[2rem] border border-[var(--ui-border)] bg-[var(--ui-surface-elev)] p-6 sm:p-10 shadow-2xl">
                {/* Organization Name */}

                <div className="mb-6">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-4 h-4 flex items-center justify-center app-muted"><Icon name="building" size="s" color="currentColor" /></span>
                    <label className="font-medium app-text text-sm">Organization Name</label>
                    <span className="text-red-500">*</span>
                  </div>
                  <input
                    type="text"
                    className={`campaign-input w-full ${name.length > 0 && name.trim().length < 3 ? 'ring-2 ring-red-500/50' : ''}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Amini Foundation"
                    disabled={submitting}
                  />
                  {name.length > 0 && name.trim().length < 3 && (
                    <div className="text-red-500 text-xs mt-1.5 font-medium">Name must be at least 3 characters.</div>
                  )}
                </div>

                {/* Official Email */}
                <div className="mb-6">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-4 h-4 flex items-center justify-center app-muted"><Icon name="email" size="s" color="currentColor" /></span>
                    <label className="font-medium app-text text-sm">Official Email</label>
                    <span className="text-red-500">*</span>
                  </div>
                  <input
                    type="email"
                    className={`campaign-input w-full`}
                    value={officialEmail}
                    onChange={(e) => setOfficialEmail(e.target.value)}
                    placeholder="director@aminifoundation.org"
                    disabled={submitting}
                  />
                </div>

                {/* Description */}
                <div className="readable-cds-fields mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-medium app-text text-sm">Description</label>
                    <span className="app-muted font-normal text-xs">(recommended)</span>
                  </div>
                  <NativeTextArea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does your organization do? What communities do you serve?"
                    rows={4}
                    disabled={submitting}
                    className="campaign-textarea mt-1 w-full"
                  />
                </div>

                {/* Logo Upload */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 flex items-center justify-center app-muted"><Icon name="image" size="s" color="currentColor" /></span>
                      <label className="font-medium app-text text-sm">Organization Logo</label>
                    </div>
                    <span className="app-muted font-normal text-xs">(optional)</span>
                  </div>
                  
                  <div className="relative group">
                    {logoPreview ? (
                      <div className="relative w-32 h-32 rounded-2xl overflow-hidden border-2 border-[var(--ui-brand-green)] group">
                        <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                        <button 
                          type="button" 
                          onClick={clearLogo}
                          className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="bg-white/20 p-2 rounded-full backdrop-blur-md">
                            <Icon name="trashCan" size="s" className="text-white" />
                          </span>
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-32 h-32 rounded-2xl border-2 border-dashed border-[var(--ui-border)] hover:border-[var(--ui-brand-green)] hover:bg-[var(--ui-brand-green)]/5 transition-all cursor-pointer">
                        <Icon name="upload" size="m" className="text-[var(--ui-muted)] mb-2" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ui-muted)]">Upload</span>
                        <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handleLogoChange} />
                      </label>
                    )}
                  </div>
                  {logoError && (
                    <div className="text-red-500 text-xs mt-2 font-medium">{logoError}</div>
                  )}
                </div>

                {/* Website URL */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 flex items-center justify-center app-muted"><Icon name="globe" size="s" color="currentColor" /></span>
                      <label className="font-medium app-text text-sm">Organization Website</label>
                    </div>
                    <span className="app-muted font-normal text-xs">(optional)</span>
                  </div>
                  <input
                    type="url"
                    className="campaign-input w-full"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://your-organization.org"
                    disabled={submitting}
                  />
                </div>

                {/* Twitter Handle */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 flex items-center justify-center app-muted"><Icon name="xLogo" size="s" color="currentColor" /></span>
                      <label className="font-medium app-text text-sm">X / Twitter Handle</label>
                    </div>
                    <span className="app-muted font-normal text-xs">(optional)</span>
                  </div>
                  <input
                    type="text"
                    className="campaign-input w-full"
                    value={twitterHandle}
                    onChange={(e) => setTwitterHandle(e.target.value)}
                    placeholder="@aminifoundation"
                    disabled={submitting}
                  />
                </div>

                {/* LinkedIn URL */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 flex items-center justify-center app-muted"><Icon name="briefcase" size="s" color="currentColor" /></span>
                      <label className="font-medium app-text text-sm">LinkedIn URL</label>
                    </div>
                    <span className="app-muted font-normal text-xs">(optional)</span>
                  </div>
                  <input
                    type="url"
                    className="campaign-input w-full"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/company/amini-foundation"
                    disabled={submitting}
                  />
                </div>

                {/* Country */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 flex items-center justify-center app-muted"><Icon name="location" size="s" color="currentColor" /></span>
                      <label className="font-medium app-text text-sm">Country</label>
                    </div>
                    <span className="app-muted font-normal text-xs">(optional)</span>
                  </div>
                  <input
                    type="text"
                    className="campaign-input w-full"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. Kenya"
                    disabled={submitting}
                  />
                </div>

                {/* Connected wallet display */}
                {isConnected && address && (
                  <div className="mb-8 rounded-2xl bg-gray-100 dark:bg-[#e5e7eb] px-5 py-4">
                    <TextCaption as="span" className="!text-gray-500 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-200 dark:border-white/10 pb-2 mb-2 block w-full">
                      Registering Wallet
                    </TextCaption>
                    <div className="flex flex-col gap-1 mt-1">
                      <TextBody as="p" className="!text-gray-900 font-mono text-sm leading-none m-0 py-1">
                        {address.slice(0, 10)}...{address.slice(-6)}
                      </TextBody>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {onchainName && <span className="bg-[var(--ui-surface-elev)] border border-[var(--ui-brand-green)] text-[var(--ui-brand-green)] px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide">ENS: {onchainName}</span>}
                        {hasCoinbaseVerification && <span className="bg-blue-500/10 border border-blue-500 text-blue-500 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide flex items-center gap-1"><span className="w-3 h-3 flex items-center justify-center"><Icon name="circleCheckmark" size="xs" color="currentColor" /></span> Coinbase Verified</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit */}
                {phase === "idle" && (
                  <Button
                    variant="primary"
                    className="campaign-btn-launch w-full [&>span]:flex [&>span]:items-center [&>span]:justify-center [&>span]:gap-2"
                    onClick={handleRegisterClick}
                    disabled={!canSubmit || submitting}
                  >
                    <span className="w-4 h-4 flex items-center justify-center"><Icon name="circleCheckmark" size="s" color="currentColor" /></span>
                    Register Organization
                  </Button>
                )}

                {phase === "confirming" && address && registrationTx && (
                  <div className="space-y-3">
                    <Banner
                      variant="informational"
                      startIcon="info"
                      startIconActive
                      styleVariant="contextual"
                      borderRadius={400}
                      title="Confirm your identity"
                      style={{ padding: '0.75rem 1.25rem' }}
                    >
                      Approve a free, zero-cost transaction in your wallet to prove you own this address. No ETH will be spent.
                    </Banner>
                    <CDPSmartButton
                      account={address}
                      network="base-sepolia"
                      transaction={registrationTx}
                      chainId={baseSepolia.id}
                      onSuccess={handleTxSuccess}
                      onError={handleTxError}
                      className="campaign-btn-launch w-full flex items-center justify-center gap-2 rounded-xl py-3 px-6 font-semibold text-base"
                    >
                      <Icon name="circleCheckmark" size="s" /> Confirm Identity Transaction
                    </CDPSmartButton>
                    <Button
                      variant="secondary"
                      className="campaign-btn-draft w-full"
                      onClick={() => { setPhase("idle"); setSubmitting(false); }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                {phase === "submitting" && (
                  <div className="flex items-center justify-center gap-3 py-4">
                    <Spinner size={3} accessibilityLabel="Registering" />
                    <TextBody className="app-text font-medium">Registering organization...</TextBody>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}
