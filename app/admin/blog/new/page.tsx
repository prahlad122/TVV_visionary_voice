import { redirect } from 'next/navigation'

// New posts are written in the dashboard's Upload tab (Blog), next to magazine uploads.
export default function NewBlogPostPage() {
  redirect('/admin?panel=magazines&tab=blog')
}
