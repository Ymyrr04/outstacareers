const DEFAULT_FUNCTION_URL =
  "https://ohxtavjababtrcrkgndq.supabase.co/functions/v1/import-outreach-profile";

const keyEl = document.getElementById("key");
const urlEl = document.getElementById("url");

chrome.storage.local.get(["importKey", "functionUrl"], (s) => {
  keyEl.value = s.importKey || "";
  urlEl.value = s.functionUrl || DEFAULT_FUNCTION_URL;
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.local.set(
    {
      importKey: keyEl.value.trim(),
      functionUrl: urlEl.value.trim() || DEFAULT_FUNCTION_URL,
    },
    () => {
      document.getElementById("saved").textContent = "Saved ✓";
      setTimeout(() => (document.getElementById("saved").textContent = ""), 2000);
    }
  );
});
