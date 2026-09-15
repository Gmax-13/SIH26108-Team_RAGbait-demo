import React from "react";
import { Composition } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { CANVAS } from "./tokens";
import { CinematicDemo } from "./CinematicDemo";
import { CinematicSchema } from "./schema";
import type { CinematicProps } from "./schema";
import { DEFAULT_PROPS } from "./defaultProps";

export function calculateDuration(props: CinematicProps): number {
  const enabled = props.scenes.filter((s) => s.enabled);
  if (enabled.length === 0) return 30;
  const total = enabled.reduce((sum, s) => sum + s.durationInFrames, 0);
  return total - props.overlap * Math.max(0, enabled.length - 1);
}

const calculateMetadata: CalculateMetadataFunction<CinematicProps> = ({
  props,
}) => {
  return {
    durationInFrames: calculateDuration(props),
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CinematicDemo"
        component={CinematicDemo}
        durationInFrames={760}
        fps={30}
        width={CANVAS.width}
        height={CANVAS.height}
        schema={CinematicSchema}
        defaultProps={{"brand":{"name":"ManakSetu","colors":{"primary":"#2A78D6","accent":"#6D4BC4","background":"#0E1C38" as const,"backgroundLight":"#16294B","surface":"#1E3765","text":"#F5F7FB","textMuted":"#93A7C4","success":"#0CA30C","warning":"#B7791F","error":"#D03B3B"},"fontSans":"Inter","fontSerif":"Fraunces","fontMono":"JetBrains Mono"},"headlines":{"pain":["24,000 Indian Standards.","Which one does your tender need?"],"resolution":["Names the right standard.","Or says it cannot."],"closer":["Built for BIS procurement"]},"cta":"Built for BIS procurement","productFeatures":[{"title":"Match","description":"Finds the Indian Standard that governs a requirement"},{"title":"Refuse","description":"Abstains when the evidence does not support an answer"},{"title":"Report","description":"Turns a whole tender into a compliance report"}],"scenes":[{"id":"hook","enabled":true,"durationInFrames":187,"enterFrom":"none" as const,"exitTo":"top" as const,"background":"gradient" as const},{"id":"reveal","enabled":true,"durationInFrames":182,"enterFrom":"bottom" as const,"exitTo":"top" as const,"background":"gradient" as const},{"id":"match","enabled":true,"durationInFrames":434,"enterFrom":"bottom" as const,"exitTo":"left" as const,"background":"gradient" as const},{"id":"refusal","enabled":true,"durationInFrames":350,"enterFrom":"right" as const,"exitTo":"left" as const,"background":"gradient" as const},{"id":"tender","enabled":true,"durationInFrames":350,"enterFrom":"right" as const,"exitTo":"left" as const,"background":"gradient" as const},{"id":"graph","enabled":true,"durationInFrames":182,"enterFrom":"right" as const,"exitTo":"top" as const,"background":"gradient" as const},{"id":"headline-resolution","enabled":true,"durationInFrames":182,"enterFrom":"bottom" as const,"exitTo":"top" as const,"background":"gradient" as const},{"id":"closer","enabled":true,"durationInFrames":120,"enterFrom":"bottom" as const,"exitTo":"none" as const,"background":"light" as const}],"overlap":15,"easing":"snappy" as const,"windowLayout":[{"id":"reveal-app","startX":200,"startY":45,"startW":1520,"startH":990,"enterAt":58,"enterDuration":20,"enterFrom":"slide-up" as const,"animateDuration":18,"exitDuration":12,"zIndex":1,"title":"ManakSetu — Indian Standards Engine"},{"id":"match-app","startX":200,"startY":45,"startW":1520,"startH":990,"enterAt":0,"enterDuration":1,"enterFrom":"fade" as const,"animateDuration":18,"exitDuration":12,"zIndex":1,"title":"ManakSetu — New Query"},{"id":"refusal-app","startX":200,"startY":45,"startW":1520,"startH":990,"enterAt":0,"enterDuration":1,"enterFrom":"fade" as const,"animateDuration":18,"exitDuration":12,"zIndex":1,"title":"ManakSetu — New Query"},{"id":"tender-app","startX":200,"startY":45,"startW":1520,"startH":990,"enterAt":0,"enterDuration":1,"enterFrom":"fade" as const,"animateDuration":18,"exitDuration":12,"zIndex":1,"title":"ManakSetu — Document Upload"},{"id":"graph-app","startX":200,"startY":45,"startW":1520,"startH":990,"enterAt":0,"enterDuration":1,"enterFrom":"fade" as const,"animateDuration":18,"exitDuration":12,"zIndex":1,"title":"ManakSetu — Standards Graph"}],"cursorPath":[],"cursorScale":1,"cursorRotation":0,"appDescriptor":{"layout":"sidebar" as const,"sidebar":{"width":220,"items":[{"label":"Dashboard","icon":"📊","active":true},{"label":"Orders","icon":"📦","active":false,"badge":"3"},{"label":"Analytics","icon":"📈","active":false},{"label":"Settings","icon":"⚙","active":false}],"avatar":{"name":"Alex Chen"}},"topBar":{"title":"Dashboard","search":true,"searchPlaceholder":"Search...","tabs":[{"label":"Overview","active":true},{"label":"Details","active":false},{"label":"History","active":false}],"actions":[{"label":"New Order","variant":"primary" as const}]},"content":{"columnCount":3,"gap":16,"panels":[{"type":"stat" as const,"title":"Revenue","label":"Revenue","value":"$12,400","delta":"+12%","messageVariant":"chat" as const},{"type":"stat" as const,"title":"Orders","label":"Orders","value":"342","delta":"+8%","messageVariant":"chat" as const},{"type":"stat" as const,"title":"Customers","label":"Customers","value":"1,205","delta":"+3%","messageVariant":"chat" as const},{"type":"table" as const,"title":"Recent Orders","columns":["Name","Status","Amount"],"rows":[["Alex Chen","Shipped","$2,400"],["Jordan Lee","Pending","$1,800"],["Sam Park","Delivered","$950"]],"statusColumn":1,"messageVariant":"chat" as const},{"type":"list" as const,"title":"Quick Actions","items":[{"label":"API Keys","description":"Manage access tokens"},{"label":"Webhooks","description":"Configure event hooks","badge":"2"},{"label":"Billing","description":"View invoices and plans"}],"messageVariant":"chat" as const},{"type":"placeholder" as const,"title":"Chart","messageVariant":"chat" as const,"height":200}]}},"music":{"enabled":true,"volume":0.35,"fadeInFrames":45,"fadeOutFrames":90},"sfxEnabled":true,"sfxVolume":0.4}}
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};
