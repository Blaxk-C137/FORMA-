import { PredictiveArcCanvas } from "@designcodeio/threeui";
import "@designcodeio/threeui/style.css";

export function Scene() {
  return (
    <div className="shader-frame">
      <PredictiveArcCanvas
        mode="dark"
        speed={1.00}
        hue={0}
        saturation={1.00}
        brightness={1.00}
      />
    </div>
  );
}
