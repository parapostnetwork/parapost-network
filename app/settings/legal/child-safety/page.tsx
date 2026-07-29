export const metadata = {
  title: "Child Safety Standards | Parapost Network",
  description:
    "Parapost Network standards for preventing child sexual abuse and exploitation and reporting child safety concerns.",
};

export default function ChildSafetyPage() {
  return (
    <main style={{minHeight:"100vh",padding:"48px 20px",background:"radial-gradient(circle at top left,rgba(168,85,247,.20),transparent 35%),#05060b",color:"#fff",fontFamily:"Inter,Arial,Helvetica,sans-serif"}}>
      <article style={{width:"100%",maxWidth:900,margin:"0 auto",padding:40,borderRadius:28,border:"1px solid rgba(255,255,255,.12)",background:"linear-gradient(180deg,rgba(24,21,37,.98),rgba(8,10,17,.98))",boxShadow:"0 24px 70px rgba(0,0,0,.4)"}}>
        <p style={{margin:"0 0 12px",color:"#c084fc",fontWeight:900,letterSpacing:".18em"}}>PARAPOST NETWORK</p>
        <h1 style={{margin:0,fontSize:"clamp(38px,7vw,64px)",lineHeight:1}}>Child Safety Standards</h1>
        <p style={{color:"#aeb3c2",margin:"16px 0 30px"}}>Last updated: July 29, 2026</p>

        <section style={{padding:20,marginBottom:30,borderRadius:20,border:"1px solid rgba(168,85,247,.32)",background:"rgba(168,85,247,.10)"}}>
          <p style={p}>Parapost Network is committed to protecting children and preventing child sexual abuse and exploitation. We maintain a zero-tolerance policy for content or conduct that exploits, endangers, grooms, or sexualizes anyone under 18.</p>
        </section>

        <h2 style={h}>Prohibited content and conduct</h2>
        <p style={p}>Parapost Network prohibits child sexual abuse material, grooming, sexual exploitation, solicitation of minors, trafficking, sextortion, attempts to sexualize minors, and links or instructions that promote or facilitate this material or conduct.</p>
        <p style={p}>Accounts that create, upload, request, distribute, promote, or attempt to obtain prohibited material may be suspended, removed, or permanently banned.</p>

        <h2 style={h}>How to report a child safety concern</h2>
        <p style={p}>Users can report safety concerns using the in-app Report option available on supported posts, profiles, comments, messages, and other content.</p>
        <p style={p}>Concerns may also be reported to <a href="mailto:parapostn@gmail.com" style={a}>parapostn@gmail.com</a>.</p>
        <p style={p}>If a child is in immediate danger, contact local emergency services or the appropriate law-enforcement authority immediately.</p>

        <h2 style={h}>Our response and enforcement</h2>
        <p style={p}>Reports are reviewed as quickly as reasonably possible. Parapost Network may remove content, restrict features, suspend or terminate accounts, preserve relevant records, and take other appropriate steps to protect users.</p>
        <p style={p}>Parapost Network reports apparent child sexual abuse material and related unlawful activity to the appropriate authorities when required by law, including the National Center for Missing &amp; Exploited Children where applicable.</p>

        <h2 style={h}>Cooperation with authorities</h2>
        <p style={p}>Parapost Network complies with applicable child-safety laws and responds to valid legal requests from law-enforcement agencies and other authorized organizations.</p>

        <h2 style={h}>Child safety contact</h2>
        <div style={{display:"grid",gap:8,padding:"18px 20px",borderRadius:18,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.05)"}}>
          <strong>Parapost Network Child Safety Contact</strong>
          <a href="mailto:parapostn@gmail.com" style={a}>parapostn@gmail.com</a>
        </div>

        <h2 style={h}>Related policies</h2>
        <p style={p}><a href="/settings/legal/privacy" style={a}>Privacy Policy</a></p>
      </article>
    </main>
  );
}

const h = {margin:"34px 0 12px",fontSize:"23px",color:"#fff"};
const p = {margin:"0 0 16px",color:"#c8cbd6",fontSize:"16px",lineHeight:1.75};
const a = {color:"#c084fc",fontWeight:800,textDecoration:"none"};
