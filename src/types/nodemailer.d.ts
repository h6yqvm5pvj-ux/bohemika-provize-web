// Minimal declaration to satisfy TypeScript on Vercel build.
declare module "nodemailer" {
  const nodemailer: any;
  export default nodemailer;
}
