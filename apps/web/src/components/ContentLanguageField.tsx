import { useState } from "react";
import type { ContentLanguage, DocumentLanguage } from "../../../../packages/shared/src/contentLanguage.js";
import { useLanguage } from "../lib/i18n";

import { readContentLanguage, rememberContentLanguage } from "../lib/contentLanguage";

export function useContentLanguage(tool: string) {
  const { language } = useLanguage();
  const [value, set] = useState(() => readContentLanguage(tool, language));
  const change = (next: ContentLanguage) => { set(next); rememberContentLanguage(tool, next); };
  return [value, change] as const;
}

export default function ContentLanguageField(props: (
  { bilingual: true; value: DocumentLanguage; onChange: (value: DocumentLanguage) => void } |
  { bilingual?: false; value: ContentLanguage; onChange: (value: ContentLanguage) => void }
) & { disabled?: boolean; ariaLabel?: string }) {
  const { language } = useLanguage();
  return <label className="content-language-field">{language === "vi" ? "Ngôn ngữ nội dung" : "Content language"}
    <select value={props.value} disabled={props.disabled} aria-label={props.ariaLabel} onChange={event => {
      const value = event.target.value;
      if (value === "vi" || value === "en") props.onChange(value);
      else if (props.bilingual && value === "vi-en") props.onChange(value);
    }}>
      <option value="vi">Tiếng Việt</option><option value="en">English</option>
      {props.bilingual && <option value="vi-en">{language === "vi" ? "Song ngữ Việt–Anh" : "Bilingual Vietnamese–English"}</option>}
    </select></label>;
}
