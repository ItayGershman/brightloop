// npm test needs Node 20 or later, like ./run. Plain JavaScript, so it runs on any Node and
// says so before the typecheck and the suite start, instead of failing or hanging halfway.
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  console.error(`npm test: needs Node 20 or later (found ${process.version}). See .nvmrc.`);
  process.exit(1);
}
