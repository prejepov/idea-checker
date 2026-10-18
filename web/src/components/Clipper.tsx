import { useEffect, useMemo, useRef, useState } from "react";
import { appendClip, buildBookmarklet } from "../../../shared/clipper";

/** Draggable bookmark + install steps. React blocks javascript: hrefs, so the href is set directly on the element. */
export function ClipperInstall() {
  const code = useMemo(() => buildBookmarklet(), []);
  const link = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    link.current?.setAttribute("href", code);
  }, [code]);

  return (
    <div className="clipper-install">
      <strong>Reddit clipper</strong>
      <span className="muted small"> (one click per post instead of copy-paste)</span>
      <ol className="small">
        <li>
          Drag this to your bookmarks bar:{" "}
          <a
            ref={link}
            className="clipper-link"
            data-testid="clipper-bookmarklet"
            draggable
            onClick={(e) => e.preventDefault()}
            title="Drag me to your bookmarks bar"
          >
            Clip to Idea Checker
          </a>{" "}
          <button
            type="button"
            className="link"
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "Code copied" : "or copy the code"}
          </button>{" "}
          <span className="muted">(new bookmark → paste it as the URL)</span>
        </li>
        <li>On Reddit, open a post that describes a problem, then click the bookmark. To clip a comment or part of a post, highlight it first.</li>
        <li>Come back here and click “Add from clipboard”.</li>
      </ol>
    </div>
  );
}

/** Appends whatever the clipper copied to the paste box, as its own paragraph. */
export function AddFromClipboard(props: { value: string; onChange: (v: string) => void }) {
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    let clipboard: string;
    try {
      clipboard = await navigator.clipboard.readText();
    } catch {
      setMessage("Clipboard access was blocked. Click in the box and press Cmd+V instead.");
      return;
    }
    const result = appendClip(props.value, clipboard);
    if (result.added) {
      props.onChange(result.text);
      setMessage(`Added: ${clipboard.trim().split("\n", 1)[0]!.slice(0, 70)}`);
    } else {
      setMessage(result.reason ?? null);
    }
  }

  return (
    <div className="row between">
      <span className="muted small" role="status">
        {message}
      </span>
      <button type="button" onClick={add}>
        Add from clipboard
      </button>
    </div>
  );
}
