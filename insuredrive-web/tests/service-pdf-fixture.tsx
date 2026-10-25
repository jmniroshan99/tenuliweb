// Synthetic development-only PDF fixture; excluded from the production bundle.
import { createRoot } from 'react-dom/client';
import RepairDocument from '../src/features/RepairDocument';
import { Modal } from '../src/components/Controls';
import '../src/style.css';
const time='2026-10-24T01:00:00Z';
const doc={id:'synthetic-note',number:'TAC-CN-TEST-R2',revision:2,kind:'completion',created_at:time,snapshot:{business:{name:'Tenuli Auto Care',address:'No-172/1-B, Keselwathugoda, Yakkala.',phone:'0715882903',email:'tenulicabsautocare@gmail.com'},job_number:'TAC-JOB-TEST',info:{customer_name:'නිමල් පෙරේරා',registration:'DEMO-1234',make_model:'Toyota Aqua'},completed_at:time,content:{work_performed:'වාහනයේ අලුත්වැඩියා නිම කර ඇත. '.repeat(50),parts_replaced:'Brake pads / තිරිංග කොටස්',recommendations:'Please return for the scheduled inspection. '.repeat(20)},billing:{invoice_number:'TAC-INV-TEST',total_minor:19000,paid_minor:5000,credit_minor:0,balance_minor:14000,as_of:time},handover:{recipient:'නිමල් පෙරේරා',handed_over_at:time,notes:'පරීක්ෂණ පිටපතකි.'}}};
createRoot(document.getElementById('root')!).render(<Modal title={doc.number} wide onClose={()=>{}}><RepairDocument doc={doc} language="si"/></Modal>);
