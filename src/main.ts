import "./style.css";

const params = new URLSearchParams(location.search);

if (params.get("window") === "overlay") {
  void import("./overlay");
} else {
  void import("./editor");
}
