import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// OAuth return route for the Gmail App User Connector popup.
// The gateway 302s here with ?success=true&code=...  We forward only the
// one-time code to the completion edge function, then signal the opener.
export default function GmailOAuthReturn() {
  const [message, setMessage] = useState("Finishing Gmail connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notifyOpener = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      reason?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: "google_mail", reason },
        window.location.origin,
      );
      setTimeout(() => window.close(), 300);
    };

    if (params.get("success") !== "true") {
      const err = params.get("error") ?? "OAuth did not complete.";
      setMessage(err);
      notifyOpener("appUserConnectorOAuthFailed", err);
      return;
    }

    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        const reason =
          "A workspace admin must enable offline access on the Gmail App User Connector client.";
        setMessage(reason);
        notifyOpener("appUserConnectorOAuthFailed", reason);
        return;
      }
      setMessage("OAuth completed without an exchange code.");
      notifyOpener("appUserConnectorOAuthFailed");
      return;
    }

    void supabase.functions
      .invoke("gmail-oauth-complete", { body: { code } })
      .then(({ error }) => {
        if (error) throw error;
        setMessage("Gmail connected!");
        notifyOpener("appUserConnectorOAuthComplete");
      })
      .catch((err) => {
        const reason = err?.message ?? "Could not finish the connection.";
        setMessage(reason);
        notifyOpener("appUserConnectorOAuthFailed", reason);
      });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 p-8 text-center">
      <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
