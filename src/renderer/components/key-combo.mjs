// Recovered from the supplied Climb 3.0.1 artifact. See docs/RECOVERY.md.
import { jsxRuntimeExports } from "../vendor/react-icons-state.mjs";

const KeyCap = ({ children, className = "" }) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `key-cap ${className}`, children });
const KeyCombo = ({ combo }) => {
  const parts = combo.split("+").map((s2) => s2.trim()).filter(Boolean);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center gap-1", children: parts.map((p2, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(KeyCap, { children: p2 }, i)) });
};

export { KeyCap, KeyCombo };
