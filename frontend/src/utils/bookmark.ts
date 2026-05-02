import type { BookmarkItem, BookmarkCategory } from "@/types";

export const parseBookmarks = (html: string): (BookmarkItem | BookmarkCategory)[] => {
  // Preprocess: Remove <p> tags which break parsing in strict HTML parsers (like DOMParser)
  // because <p> is not allowed inside <dl> in strict mode, causing elements to be ejected or structure to break.
  // Netscape bookmark files use <p> loosely as separators.
  const cleanHtml = html.replace(/<p>/gi, "").replace(/<\/p>/gi, "");
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanHtml, "text/html");

  const processList = (dl: Element): (BookmarkItem | BookmarkCategory)[] => {
    const items: (BookmarkItem | BookmarkCategory)[] = [];
    const children = Array.from(dl.children);

    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (!node) continue;
      // Handle DT (Item or Folder)
      if (node.tagName.toLowerCase() === "dt") {
        const h3 = node.querySelector("h3");
        const a = node.querySelector("a");

        if (h3) {
          // Folder
          const title = h3.textContent || "Untitled Folder";
          let childrenList: (BookmarkItem | BookmarkCategory)[] = [];

          // 1. Check inside the DT itself (some parsers put DL inside DT when <p> is removed)
          const internalDL = node.querySelector("dl");
          if (internalDL) {
            childrenList = processList(internalDL);
          } else {
            // 2. Look ahead for siblings
            for (let j = i + 1; j < children.length; j++) {
              const sibling = children[j];
              if (!sibling) continue;
              const tagName = sibling.tagName.toLowerCase();

              if (tagName === "dl") {
                childrenList = processList(sibling);
                break; // Found the children container
              } else if (tagName === "dd") {
                const childDL = sibling.querySelector("dl");
                if (childDL) {
                  childrenList = processList(childDL);
                }
                break; // Found the children container
              } else if (tagName === "dt") {
                break; // Hit the next item, so this folder is empty
              }
            }
          }

          items.push({
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            title,
            type: "category",
            children: childrenList,
            collapsed: false,
          });
        } else if (a) {
          // Link
          const url = a.href;
          if (!url.startsWith("http")) continue;

          let icon = a.getAttribute("icon");
          if (!icon) {
            try {
              icon = `https://api.uomg.com/api/get.favicon?url=${new URL(url).hostname}`;
            } catch {
              icon = "";
            }
          }

          items.push({
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            title: a.textContent || url,
            url,
            icon: icon || "",
            type: "link",
          });
        }
      }
    }
    return items;
  };

  const rootDL = doc.querySelector("dl");
  if (!rootDL) {
    // Fallback: just find all links if no DL structure found
    const links = doc.querySelectorAll("a");
    const simpleItems: BookmarkItem[] = [];
    links.forEach((link) => {
      const url = link.href;
      if (!url.startsWith("http")) return;
      simpleItems.push({
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        title: link.textContent || url,
        url: url,
        icon: "",
        type: "link",
      });
    });
    return simpleItems;
  }

  return processList(rootDL);
};
