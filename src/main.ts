import "./style.css";

const params = new URLSearchParams(location.search);

if (params.get("window") === "overlay") {
  // Kept for compatibility; the app no longer creates an overlay window.
  void 0;
} else {
  import("./app");
}
