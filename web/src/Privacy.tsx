import { Link } from 'react-router';

export function Privacy() {
  return (
    <main>
      <h1>Privacy</h1>
      <p>
        Lapse Radar is a portfolio project, not a commercial service. This page says plainly what it
        keeps.
      </p>
      <h2>What is stored</h2>
      <ul>
        <li>Your email address and a salted scrypt hash of your password (never the password).</li>
        <li>
          The items you add (host names, labels, notes, expiry dates) and the alerts made from them.
        </li>
        <li>
          A session: only a hash of the cookie token is stored, and the cookie is used for nothing
          else. There are no analytics, advertising or tracking cookies.
        </li>
        <li>
          Short-lived counters for abuse limits, keyed by your IP address (IPv6: its /64 prefix) or
          email. They are purged after about a day.
        </li>
      </ul>
      <h2>Who else sees it</h2>
      <ul>
        <li>Netlify hosts the site and runs the code; Neon hosts the database.</li>
        <li>
          Resend delivers alert emails, if you leave them on. It receives your email address and the
          alert text.
        </li>
        <li>
          Checks connect from the server to the hosts you add (TLS on port 443, and public RDAP
          registries for domains).
        </li>
      </ul>
      <h2>Your control</h2>
      <p>
        You can turn emails off in the alert settings and delete your account from the dashboard.
        Deleting removes your account, sessions, items and alerts at once.
      </p>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </main>
  );
}
