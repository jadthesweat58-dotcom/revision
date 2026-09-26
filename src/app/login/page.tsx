import LoginForm from "./LoginForm";

export const metadata = { title: "Log in · Revision" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <div className="card login">
      <h1>Revision</h1>
      <p className="dim">Enter your password to open your dashboard.</p>
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </div>
  );
}
