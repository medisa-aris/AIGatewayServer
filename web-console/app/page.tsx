import { redirect } from 'next/navigation';

/** Root route → send users to the Overview dashboard (auth gate lives in the dashboard layout). */
export default function Home() {
  redirect('/overview');
}
