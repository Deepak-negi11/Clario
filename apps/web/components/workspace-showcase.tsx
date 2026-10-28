import Image from "next/image";

type WorkspaceShowcaseProps = {
  variant?: "hero" | "feature";
};

export function WorkspaceShowcase({ variant = "feature" }: WorkspaceShowcaseProps) {
  return (
    <figure className={`workspace-showcase is-${variant}`}>
      <div className="workspace-window">
        <div className="workspace-window-bar" aria-hidden="true">
          <span className="workspace-window-dots"><i /><i /><i /></span>
          <span>Clario · Team HQ</span>
          <span className="workspace-live"><i /> Live</span>
        </div>
        <div className="workspace-screen">
          <Image
            src="/assets/product-workspace.png"
            alt="The Clario office with private rooms, a meeting table, lounge, desks, and pixel avatars"
            width={2000}
            height={1191}
            priority={variant === "hero"}
            sizes={variant === "hero" ? "(max-width: 820px) 100vw, 72vw" : "(max-width: 1100px) 100vw, 62vw"}
            className="workspace-image"
          />
          <div className="workspace-walk-route" aria-hidden="true">
            <span className="workspace-walker">
              <i className="workspace-walker-name">Alex</i>
              <i className="workspace-walker-sprite" />
              <i className="workspace-walker-shadow" />
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}
