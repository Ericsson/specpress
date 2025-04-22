import { unified } from "unified";
import markdown from "remark-parse";
import remarkParse from "remark-parse";
import remarkHtml from "remark-html";

import pdf from "remark-pdf/node";
import docx from "remark-docx";

export async function remarkBuffer(buffer, remarkType) {
	const processor = {
		docx: unified().use(markdown).use(docx, { output: "buffer" }),
		html: unified().use(remarkParse).use(remarkHtml),
		pdf: unified().use(markdown).use(pdf, { output: "buffer" }),
	};

	const doc = await processor[remarkType].process(buffer);
	return remarkType === "pdf" || remarkType === "docx"
		? await doc.result
		: Buffer.from(doc.toString(), "utf-8");
}
