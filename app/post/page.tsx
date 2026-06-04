import { redirect } from "next/navigation";

/** Legacy /post URL — Sell tab lives at /post/ai */
export default function PostPageRedirect() {
  redirect("/post/ai");
}
