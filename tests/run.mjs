import { run } from 'node:test';
import { spec as specReporter } from 'node:test/reporters';
import { glob } from 'node:fs';
import { promisify } from 'node:util';

const globAsync = promisify(glob);

async function runTests() {
	const testFiles = await globAsync('tests/**/*.test.mjs');
	
	const stream = run({
		files: testFiles,
		concurrency: true,
	});

	stream.compose(specReporter).pipe(process.stdout);
}

runTests().catch(console.error);
