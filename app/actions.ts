"use server";

import { redirect } from "next/navigation";
import { signIn, signOut } from "@/lib/auth";

export async function login(formData: FormData) {
  await signIn("credentials", {
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: "/dashboard",
  });
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}

export async function goDashboard() {
  redirect("/dashboard");
}
