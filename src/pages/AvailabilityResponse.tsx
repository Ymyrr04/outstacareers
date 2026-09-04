import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, XCircle, Info } from "lucide-react";

const AvailabilityResponse = () => {
  const [params] = useSearchParams();
  const status = params.get("status") || "error";
  const response = params.get("response") || "";

  let icon = <XCircle className="w-16 h-16 text-destructive mx-auto" />;
  let title = "Something Went Wrong";
  let message = "An unexpected error occurred. Please try again later or contact the recruitment team.";

  if (status === "success") {
    icon = <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />;
    title = "Thank You for Your Response!";
    message =
      response === "no"
        ? "We understand you're not available at this time. Feel free to apply again in the future once you are available. We'd love to hear from you!"
        : "We appreciate you confirming your availability. Our team will be in touch soon with exciting opportunities that match your profile!";
  } else if (status === "already") {
    icon = <Info className="w-16 h-16 text-blue-500 mx-auto" />;
    title = "Thank You for Your Response!";
    message =
      "You have already submitted your response. If you need to update your availability, please contact the recruitment team.";
  } else if (status === "invalid") {
    title = "Link Invalid or Expired";
    message =
      "This link has already been used or expired. Please contact the recruitment team if you need assistance.";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-5">
      <Helmet>
        <title>{title} - OutSta</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="bg-card rounded-2xl shadow-xl p-12 text-center max-w-md w-full">
        <div className="mb-6">{icon}</div>
        <h1 className="text-2xl font-bold text-foreground mb-4">{title}</h1>
        <p className="text-muted-foreground leading-relaxed">{message}</p>
        <div className="mt-8 pt-6 border-t border-border text-sm text-muted-foreground">
          You can close this window now.
        </div>
      </div>
    </div>
  );
};

export default AvailabilityResponse;
