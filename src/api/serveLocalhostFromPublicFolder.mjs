import { exec } from "child_process";
import { normalize } from "path";

export function serveLocalhostFromPublicFolder(
	pathRootFolder,
	pathPublicFolder
) {
	const npmCommand = `${pathRootFolder}/node_modules/specpress/node_modules/.bin/http-server ${pathPublicFolder} -c-1 -p 8080`;
	exec(npmCommand, (error, stdout, stderr) => {
		if (error) {
			console.error(`Error: ${error.message}`);
			return;
		}
		console.log(`Child stdout: ${stdout}`);
	});
}
