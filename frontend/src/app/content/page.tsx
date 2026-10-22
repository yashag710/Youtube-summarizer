import { redirect } from "next/navigation";

// The summary used to live at /content; keep old links and bookmarks working
export default function ContentPage() {
  redirect("/");
}
