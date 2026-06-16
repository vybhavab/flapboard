/**
 * Real-time design preview (not a test). Mounts a couple of boards on the real
 * rAF clock so they animate and settle on their own — handy for screenshotting
 * the look while iterating on styles.css. Not referenced by the package build.
 */
import { createRoot } from "react-dom/client";

import { FlapBoard } from "../../src/react";

import "../../src/styles.css";

function Demo() {
  return (
    <>
      <FlapBoard
        rows={6}
        cols={23}
        theme="flipflap"
        frame={["#C8102E", "#FFFFFF", "#012169"]}
        text="HELLO WORLD"
      />
      <FlapBoard
        rows={6}
        cols={23}
        frame={["#16A34A", "#FACC15"]}
        text="ARRIVALS ON TIME"
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Demo />);
