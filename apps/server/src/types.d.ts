declare module "pdf-parse" {
  const parse: (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
  export default parse;
}
