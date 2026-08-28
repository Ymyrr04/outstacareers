import { useEffect, useState } from "react";

// OAuth return route for the Gmail App User Connector popup.
// The gateway 302s here with ?success=true&code=...  The popup does NOT call
// the edge function itself (it may not carry the admin session, e.g. inside the
// Lovable preview). It forwards the one-time code to the opener, which
// exchanges it with an authenticated request.
export default function GmailOAuthReturn() {
  const [message, setMessage] = useState("Finishing Gmail connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notifyOpener = (
      type: "appUserConnectorOAuthCode" | "appUserConnectorOAuthFailed",
      payload?: { code?: string; reason?: string },
    ) => {
      window.opener?.postMessage(
        { type, connectorId: "google_mail", ...payload },
        window.location.origin,
      );
      setTimeout(() => window.close(), 300);
    };

    if (params.get("success") !== "true") {
      const err = params.get("error") ?? "OAuth did not complete.";
      setMessage(err);
      notifyOpener("appUserConnectorOAuthFailed", { reason: err });
      return;
    }

    const code = params.get("code");
    if (!code) {
      const reason =
        params.get("offline_access_allowed") === "false"
          ? "A workspace admin must enable offline access on the Gmail App User Connector client."
          : "OAuth completed without an exchange code.";
      setMessage(reason);
      notifyOpener("appUserConnectorOAuthFailed", { reason });
      return;
    }

    setMessage("Gmail authorized! Finishing up…");
    notifyOpener("appUserConnectorOAuthCode", { code });
  }, []);


  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 p-8 text-center">
      <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
