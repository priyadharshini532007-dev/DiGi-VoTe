export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-navy-900">About DigiVote</h1>
      <div className="mt-6 space-y-4 text-slate-700">
        <p>
          DigiVote is a multi-organization digital election platform built as an Object-Oriented Programming and
          Database Management Systems capstone project. It covers the complete election lifecycle: onboarding an
          organization, configuring rules, registering and approving candidates, managing eligible voters, anonymous
          voting, receipts, results, auditing and archival.
        </p>
        <p>
          The backend is a Java 21 / Spring Boot modular monolith on a normalized MySQL schema managed by Flyway
          migrations, with SQL views, a stored procedure and integrity triggers. The frontend is React with Tailwind
          CSS. Cryptography uses Bouncy Castle and standard Java primitives: RSA blind signatures for anonymous
          credentials and the Paillier cryptosystem for encrypted tallying.
        </p>
        <p>
          The guiding principle: every eligible voter can cast one vote, every accepted ballot can be independently
          checked, and the election process leaves a verifiable audit trail.
        </p>
      </div>
    </div>
  );
}
