import { memo, type ReactNode } from "react";
import { css } from "styled-system/css";

type SectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

const section = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  width: "100%",
});

const sectionHeader = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
});

const sectionTitle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  color: "text.subtle",
  letterSpacing: "wide",
  textTransform: "uppercase",
  userSelect: "none",
});

const sectionDescription = css({
  fontSize: "xs",
  color: "text.placeholder",
  letterSpacing: "tight",
});

const sectionDivider = css({
  height: "1px",
  background: "divider",
  width: "100%",
});

const sectionContent = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  width: "100%",
});

export const Section = memo(function Section({ title, description, children }: SectionProps) {
  return (
    <div className={section}>
      <div className={sectionHeader}>
        <h3 className={sectionTitle}>{title}</h3>
        {description && <p className={sectionDescription}>{description}</p>}
      </div>
      <div className={sectionDivider} />
      <div className={sectionContent}>{children}</div>
    </div>
  );
});
