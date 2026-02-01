import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkHtml from "remark-html";
import pdf from "remark-pdf/node";
import docx from "remark-docx";

const processors = {
	docx: unified().use(remarkParse).use(docx, { output: "buffer" }),
	html: unified().use(remarkParse).use(remarkHtml),
	pdf: unified().use(remarkParse).use(pdf, { output: "buffer" }),
};

export async function remarkBuffer(buffer, remarkType) {
	const processor = processors[remarkType];
	if (!processor) throw new Error(`Invalid type: ${remarkType}`);
	
	const doc = await processor.process(buffer);
	return remarkType === "pdf" || remarkType === "docx"
		? await doc.result
		: Buffer.from(doc.toString(), "utf-8");
}
