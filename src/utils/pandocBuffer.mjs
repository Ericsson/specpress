import nodePandoc from "node-pandoc";

export async function pandocBuffer(
	sourceBuffer,
	pandocType,
	pathExportFolder,
	exportName
) {
	let src = sourceBuffer;

	// Arguments can be either a single String or in an Array
	let args = `-f markdown -t ${pandocType} -o ${pathExportFolder}/${exportName}.${pandocType}`;

	// Set your callback function
	const callback = (err, result) => {
		if (err) console.error("Error: ", err);
		return result;
	};

	// Call pandoc
	nodePandoc(src, args, callback);
}
