// ============================================================
// CAFM 2026-27 OPERATIONAL CADENCE — SEED TASK LIST
// ------------------------------------------------------------
// Sourced from CAFM_Operational_Cadence_2026-27_MERGED.pdf.
// Task ids are stable strings so re-seeding is idempotent —
// the seeder will only insert tasks whose id isn't already in
// the database.  Each task gets a default role (assignee) and
// a category for filtering.
// ============================================================

export const MONTHS = [
  { key: 'jul', label: 'Jul 2026' },
  { key: 'aug', label: 'Aug 2026' },
  { key: 'sep', label: 'Sep 2026' },
  { key: 'oct', label: 'Oct 2026' },
  { key: 'nov', label: 'Nov 2026' },
  { key: 'dec', label: 'Dec 2026' },
  { key: 'jan', label: 'Jan 2027' },
  { key: 'feb', label: 'Feb 2027' },
  { key: 'mar', label: 'Mar 2027' },
  { key: 'apr', label: 'Apr 2027' },
  { key: 'may', label: 'May 2027' },
  { key: 'jun', label: 'Jun 2027' },
];

// Each month maps to a calendar month + year for default due-date computation.
export const MONTH_TO_DATE = {
  jul: '2026-07-31', aug: '2026-08-31', sep: '2026-09-30', oct: '2026-10-31',
  nov: '2026-11-30', dec: '2026-12-31', jan: '2027-01-31', feb: '2027-02-28',
  mar: '2027-03-31', apr: '2027-04-30', may: '2027-05-31', jun: '2027-06-30',
};

export const ROLE_OPTIONS = ['HM', 'DOS', 'DOS-AT', 'Admin', 'Laura', 'Yearbook', 'Unassigned'];

export const CATEGORY_LABEL = {
  operational: 'Operational',
  comms: 'Communications',
  standing: 'Standing / Recurring',
  compliance: 'Compliance',
  governance: 'Governance',
  finance: 'Finance',
  admissions: 'Admissions',
  fundraising: 'Fundraising',
};

// Standing items repeat every month — Aug-May for most school-year items, Jul-Jun for admin-only.
const STANDING_ALL_MONTHS = [
  { title: 'Grade checks',                     desc: 'Review school-wide; flag interventions; communicate with families before issues compound.', role: 'HM',    cat: 'standing' },
  { title: 'Tuition / billing review',         desc: 'Confirm payments; follow up on outstanding accounts; bill late fees on the 11th.',           role: 'Admin', cat: 'finance' },
  { title: 'Send monthly statements',          desc: 'Send statements to all enrolled families.',                                                  role: 'Admin', cat: 'finance' },
  { title: 'Faculty meeting',                  desc: 'Agenda prep, run, follow-up notes.',                                                         role: 'HM',    cat: 'standing' },
  { title: 'Family Mass prep',                 desc: 'Liturgical assignments, readers, music; reminder to parents the week prior.',                role: 'DOS',   cat: 'standing' },
  { title: 'Spirit Wear / liturgical observance', desc: 'Confirm any feast day observance; dress code reminder.',                                  role: 'HM',    cat: 'standing' },
  { title: 'Monthly email update',             desc: 'Newsletter to families and prospect list.',                                                  role: 'HM',    cat: 'comms' },
];
const STANDING_AUG_MAY = [
  { title: 'SUFS invoices submitted',          desc: 'Submit on schedule (Aug through May).',                                                      role: 'Admin', cat: 'compliance' },
];

const SCHOOL_YEAR_MONTHS = ['aug','sep','oct','nov','dec','jan','feb','mar','apr','may'];
const ALL_MONTHS = MONTHS.map(m => m.key);

// ────────── PER-MONTH TASKS (from the PDF cadence) ──────────
const MONTH_TASKS = {
  jul: [
    // Operational
    { title: 'Late-summer admissions wrap-up for new families',                role: 'Admin', cat: 'admissions' },
    { title: 'Finalize back-to-school packet',                                 role: 'HM',    cat: 'comms', desc: 'Calendar PDF, dress code, supply list, key contacts — ready to send late July.' },
    { title: 'Confirm faculty contracts signed; onboarding scheduled',         role: 'HM',    cat: 'governance' },
    { title: 'Pre-service week planning (Aug 3)',                              role: 'HM',    cat: 'operational', desc: 'Agenda, materials, retreat element, faculty assignments.' },
    { title: 'Confirm Orientation logistics for Aug 6',                        role: 'HM',    cat: 'operational', desc: 'Room, AV, refreshments, schedule, presenters.' },
    { title: 'Confirm tuition / billing system ready for Aug 1',               role: 'Admin', cat: 'finance', desc: 'Verify all families enrolled in payment plan.' },
    { title: 'Classroom prep, supply ordering, textbook confirmation',         role: 'HM',    cat: 'operational' },
    { title: 'Confirm student rosters; flag incomplete enrollments',           role: 'HM',    cat: 'admissions' },
    { title: "Confirm liturgical schedule with St. Anne's",                    role: 'DOS',   cat: 'operational', desc: 'Family Mass dates, Mass of the Holy Spirit, HDOs.' },
    { title: 'Update school website for 2026–27',                              role: 'HM',    cat: 'comms', desc: 'Calendar, staff, faculty bios, news.' },
    { title: 'Order name tags AND ID cards for faculty',                       role: 'Admin', cat: 'operational' },
    { title: 'Confirm Sunbiz Annual Report has been filed',                    role: 'Admin', cat: 'compliance', desc: 'FL nonprofit, due May 1 — verify before fiscal-year-end review.' },
    { title: 'Renew Surety Bond',                                              role: 'Admin', cat: 'compliance' },
    { title: 'Begin DOE Annual Survey preparation',                            role: 'Admin', cat: 'compliance' },
    { title: 'FDLE background checks for any new hires',                       role: 'Admin', cat: 'compliance' },
    { title: 'Virtus compliance — verify all faculty current',                 role: 'Admin', cat: 'compliance', desc: 'Schedule any required renewals.' },
    { title: 'Update Family Handbook, Employee Handbook, Abuse Policy',        role: 'HM',    cat: 'governance', desc: 'Final 2026–27 versions.' },
    { title: 'Faculty onboarding & annual signed documents collected',         role: 'HM',    cat: 'governance' },
    { title: 'New Hire Reporting (Florida — within 20 days of hire date)',     role: 'HM',    cat: 'compliance' },
    { title: 'Set up Praxis contracts and autobilling for incoming families',  role: 'Admin', cat: 'finance' },
    { title: 'Begin enrolling SUFS students for 2026–27',                      role: 'Admin', cat: 'compliance' },
    // Communications
    { title: 'Send back-to-school packet to all families (late July)',         role: 'HM',    cat: 'comms', desc: 'Calendar, dress code, supply list, key contacts, summer reading reminders.' },
    { title: 'Tuition reminder for Aug 1 first payment',                       role: 'HM',    cat: 'comms' },
    { title: 'Notify parents of Orientation (Aug 6 evening)',                  role: 'HM',    cat: 'comms', desc: '9th, 10th & transfer families.' },
    { title: 'Notify parents of upcoming first day (Aug 11)',                  role: 'HM',    cat: 'comms' },
    { title: 'August email update: Back to School',                            role: 'HM',    cat: 'comms', desc: 'Drafted and scheduled to send.' },
    { title: 'Email teachers about upcoming in-service',                       role: 'HM',    cat: 'comms' },
  ],
  aug: [
    { title: 'Send summer back-to-school packet (final touch)',                role: 'HM',    cat: 'comms' },
    { title: 'Pre-service week: gradebook setup, roster, classroom prep',      role: 'HM',    cat: 'operational' },
    { title: 'Confirm tuition payments; follow up on outstanding accounts',    role: 'Admin', cat: 'finance' },
    { title: 'First-month grade check (after 2 weeks)',                        role: 'HM',    cat: 'operational' },
    { title: 'Schedule pulpit talks with students',                            role: 'HM',    cat: 'operational' },
    { title: 'Odyssey Week / opening culture-setting',                         role: 'HM-DOS',cat: 'operational', desc: 'Per Chesterton tradition — first week.' },
    { title: 'Faculty onboarding continues; finalize signed annual docs',      role: 'HM',    cat: 'governance' },
    { title: 'Teacher training sessions during pre-service week',              role: 'HM',    cat: 'operational' },
    { title: 'Finalize schedules and enter into Praxis',                       role: 'HM',    cat: 'operational' },
    { title: 'Notify parents & teachers of upcoming Parents Night (Sept 24)',  role: 'HM',    cat: 'comms' },
    { title: 'Notify parents of upcoming Parent-Teacher Conferences (Oct 8)',  role: 'HM',    cat: 'comms' },
    { title: 'Recruiting email re: student pulpit talks',                      role: 'HM',    cat: 'comms' },
  ],
  sep: [
    { title: 'BUDGET DRAFT DUE',                                               role: 'HM',    cat: 'finance', desc: 'Charlie + bookkeeper; circulate to board treasurer.' },
    { title: 'Schedule professional school photos for October',                role: 'Admin', cat: 'operational' },
    { title: 'Plan upperclass St. Augustine trip',                             role: 'Laura', cat: 'operational', desc: 'Date, transport, chaperones.' },
    { title: 'Begin Vision Dinner / Gala planning (April 9 anchor)',           role: 'Laura', cat: 'fundraising' },
    { title: 'Begin Teacher Acquisition planning for 2027–28',                 role: 'HM',    cat: 'operational', desc: 'Early scouting.' },
    { title: 'Develop annual recruitment plan with Recruitment Coordinator',   role: 'HM-DOS',cat: 'admissions' },
    { title: 'Connect with feeder schools',                                    role: 'HM',    cat: 'admissions' },
    { title: 'Final reminders to parents about Parents Night (Sept 24)',       role: 'HM',    cat: 'comms' },
    { title: 'Reminders re: Parent-Teacher Conferences (Oct 8)',               role: 'HM',    cat: 'comms' },
    { title: 'Notify parents of Open House Saturday (Oct 17)',                 role: 'HM',    cat: 'comms' },
    { title: 'Notify parents of House Games / noon dismissal (Oct 30)',        role: 'HM',    cat: 'comms' },
    { title: 'Notify parents/board/prospects of All Saints Potluck (Nov 1)',   role: 'HM',    cat: 'comms' },
    { title: 'Notify parents of Namestorming evening (Nov 12)',                role: 'HM',    cat: 'comms' },
    { title: 'Communicate Fall Break dates (Oct 9 & 12)',                      role: 'HM',    cat: 'comms' },
    { title: 'Open House marketing push (MailChimp + social)',                 role: 'Admin', cat: 'comms' },
    { title: 'Info Session announcements + Shadow Day signups',                role: 'HM',    cat: 'comms' },
    { title: 'Notify teachers of upcoming report card grades due',             role: 'HM',    cat: 'comms' },
  ],
  oct: [
    { title: 'Q1 report cards distributed',                                    role: 'HM',    cat: 'operational', desc: 'Within 1 week of quarter end.' },
    { title: 'Open House logistics',                                           role: 'HM',    cat: 'admissions', desc: 'Student volunteers, signage, follow-up plan.' },
    { title: 'Applications open Oct 17',                                       role: 'HM',    cat: 'admissions' },
    { title: 'Plan Fine Arts night',                                           role: 'DOS-AT',cat: 'operational', desc: 'Katie and Heather coordinate.' },
    { title: 'Begin monthly yearbook meetings',                                role: 'Yearbook', cat: 'operational', desc: 'Advisor + student team kickoff.' },
    { title: 'October yearbook meeting',                                       role: 'Yearbook', cat: 'operational' },
    { title: 'Connect with feeder schools',                                    role: 'HM',    cat: 'admissions', desc: 'Catholic parishes, homeschool groups.' },
    { title: 'Final reminders re: Parent-Teacher Conferences (Oct 8)',         role: 'HM',    cat: 'comms' },
    { title: 'Final reminders re: Open House (Oct 17)',                        role: 'HM',    cat: 'comms' },
    { title: 'Applications Open Oct 17 — send notice (MailChimp, social)',     role: 'HM',    cat: 'comms' },
    { title: 'Final reminders re: House Games (Oct 30)',                       role: 'HM',    cat: 'comms' },
    { title: 'Reminders re: All Saints Potluck (Nov 1)',                       role: 'HM',    cat: 'comms' },
    { title: 'Reminders re: Namestorming (Nov 12)',                            role: 'HM',    cat: 'comms' },
    { title: 'Notify parents of Thanksgiving Break (Nov 23–27)',               role: 'HM',    cat: 'comms' },
    { title: 'Notify community of Fine Arts Night (Dec 15)',                   role: 'HM',    cat: 'comms', desc: 'Heather & Katie coordinate.' },
    { title: 'Email: Shadow Day / Open House push',                            role: 'HM',    cat: 'comms' },
  ],
  nov: [
    { title: 'DRAMA: First parent notice — January practice + Saturdays',      role: 'DOS',   cat: 'comms' },
    { title: 'Mid-quarter grade check + intervention outreach',                role: 'HM',    cat: 'operational', desc: 'Before Thanksgiving.' },
    { title: 'Begin Christmas Break communications planning',                  role: 'HM',    cat: 'comms' },
    { title: 'Scholarship compliance checks (mid-year)',                       role: 'Admin', cat: 'compliance' },
    { title: 'November yearbook meeting',                                      role: 'Yearbook', cat: 'operational' },
    { title: 'Early Application Deadline (set/announce specific date)',        role: 'Admin', cat: 'admissions' },
    { title: 'Final reminders re: Namestorming (Nov 12)',                      role: 'HM',    cat: 'comms' },
    { title: 'Final reminders re: Thanksgiving Break',                         role: 'HM',    cat: 'comms', desc: 'Travel, return date.' },
    { title: 'Reminders re: Fine Arts Night (Dec 15)',                         role: 'DOS',   cat: 'comms' },
    { title: 'Notify parents of Christmas Break (Dec 21–31) + Dec 18 noon',    role: 'HM',    cat: 'comms' },
    { title: 'Remind teachers of Christmas party 12/18 @ 5:30',                role: 'HM',    cat: 'comms' },
    { title: 'Email: Early Application deadline reminder',                     role: 'HM',    cat: 'comms' },
    { title: 'Email: Yearbook order link',                                     role: 'DOS',   cat: 'comms' },
  ],
  dec: [
    { title: 'DRAMA: Reminder to parents about January practice (2nd touch)',  role: 'DOS',   cat: 'comms' },
    { title: 'Confirm bishop for May 20 Baccalaureate Mass & Commencement',    role: 'Admin', cat: 'operational' },
    { title: 'End-of-year giving / Catholic Foundation acknowledgments',       role: 'Laura', cat: 'fundraising', desc: 'Before Dec 31.' },
    { title: 'Send Christmas Break communications + post-break expectations',  role: 'HM',    cat: 'comms' },
    { title: 'Faculty Christmas party (Dec 18, 5:30)',                         role: 'HM',    cat: 'operational' },
    { title: 'Begin Teacher Acquisition outreach for 2027–28',                 role: 'HM',    cat: 'operational' },
    { title: 'December yearbook meeting; finalize fall content',               role: 'Yearbook', cat: 'operational' },
    { title: 'Final reminders re: Fine Arts Night (Dec 15)',                   role: 'DOS',   cat: 'comms' },
    { title: 'Final reminders re: Christmas Break / Dec 18 noon dismissal',    role: 'HM',    cat: 'comms' },
    { title: 'Notify parents of School Play (Feb 5 evening)',                  role: 'DOS',   cat: 'comms' },
    { title: 'Email: Giving Tuesday appeal',                                   role: 'Laura', cat: 'fundraising' },
    { title: 'Email: End of Year Giving (before Dec 31)',                      role: 'Laura', cat: 'fundraising' },
  ],
  jan: [
    { title: 'Order Formal Uniforms for new students / replacements',          role: 'Laura', cat: 'operational' },
    { title: 'YEARBOOK: Planning continues — content production ramps up',     role: 'DOS',   cat: 'operational' },
    { title: 'GALA ATTIRE: Parent heads-up letter',                            role: 'Laura', cat: 'fundraising', desc: 'Explain April 9 need, vendor options, sizing window.' },
    { title: 'DRAMA: First-week-of-January reminder (3rd touch)',              role: 'DOS',   cat: 'comms', desc: 'Practice schedule + Saturday work days, before Jan 19.' },
    { title: 'Vision Dinner planning in earnest',                              role: 'Laura', cat: 'fundraising', desc: 'Sponsorships, venue, student roles, family attendance counts.' },
    { title: 'Q2 report cards distributed',                                    role: 'HM',    cat: 'operational' },
    { title: 'Renew SUFS for next school year (2027–28)',                      role: 'Admin', cat: 'compliance', desc: 'Enrollment window opens.' },
    { title: 'Begin updating Employee Handbook and Abuse Policy',              role: 'HM',    cat: 'governance' },
    { title: 'Request annual fire inspection',                                 role: 'Admin', cat: 'compliance' },
    { title: 'Submit yearbook for printing',                                   role: 'Yearbook', cat: 'operational', desc: 'Timing depends on vendor — confirm.' },
    { title: 'Regular Application Deadline',                                   role: 'HM',    cat: 'admissions' },
    { title: 'Reminders re: School Play (Feb 5 evening)',                      role: 'DOS',   cat: 'comms' },
    { title: 'Notify parents of Parent-Teacher Conferences (Feb 19)',          role: 'HM',    cat: 'comms' },
    { title: "Notify parents of Parents Night at Falardeau's (Feb 25 eve)",    role: 'HM',    cat: 'comms' },
    { title: 'Notify parents of Walk for Life (March 6 — MANDATORY)',          role: 'HM',    cat: 'comms' },
    { title: 'Notify parents of Vision Dinner (April 9 evening)',              role: 'HM',    cat: 'comms' },
    { title: 'Email: Regular Application Deadline reminder',                   role: 'HM',    cat: 'comms' },
    { title: 'Email: Fundraising / gala save-the-date',                        role: 'Laura', cat: 'comms' },
  ],
  feb: [
    { title: 'GALA ATTIRE: Order window — students place orders',              role: 'Laura', cat: 'fundraising' },
    { title: 'GALA ATTIRE: Measure students for gala uniforms',                role: 'Laura', cat: 'fundraising' },
    { title: 'YEARBOOK: Content production in full swing',                     role: 'Yearbook', cat: 'operational', desc: 'Photo coverage of every spring event.' },
    { title: 'Vision Dinner planning intensifies',                             role: 'Laura', cat: 'fundraising', desc: 'Venue, program, run-of-show, sponsor outreach.' },
    { title: 'Spring portraits (if scheduled)',                                role: 'Admin', cat: 'operational' },
    { title: 'Final gala planning — programs, materials, AV, signage',         role: 'Laura', cat: 'fundraising' },
    { title: 'Final reminders re: School Play (Feb 5)',                        role: 'DOS',   cat: 'comms' },
    { title: 'Final reminders re: Parent-Teacher Conferences (Feb 19)',        role: 'HM',    cat: 'comms' },
    { title: 'Final reminders re: Parents Night (Feb 25)',                     role: 'HM',    cat: 'comms' },
    { title: 'Reminders re: Walk for Life (March 6 — MANDATORY)',              role: 'HM',    cat: 'comms' },
    { title: 'Reminders re: Vision Dinner (April 9)',                          role: 'Laura', cat: 'comms' },
    { title: 'Notify parents of Spring Break (March 29 – April 2)',            role: 'HM',    cat: 'comms' },
    { title: 'Notify parents of Baccalaureate & Commencement (May 20)',        role: 'HM',    cat: 'comms' },
    { title: 'Email: Ops update + upcoming gala',                              role: 'HM',    cat: 'comms' },
    { title: 'Email: Holy Thursday Pilgrimage notice',                         role: 'DOS',   cat: 'comms' },
  ],
  mar: [
    { title: 'Q3 report cards distributed',                                    role: 'HM',    cat: 'operational' },
    { title: 'GALA ATTIRE: Alterations window',                                role: 'Laura', cat: 'fundraising' },
    { title: 'Vision Dinner: confirm student roles, family RSVPs, run-of-show',role: 'Laura', cat: 'fundraising' },
    { title: 'YEARBOOK: Final content review begins; flag missing coverage',   role: 'Yearbook', cat: 'operational' },
    { title: 'COMMENCEMENT: Order diplomas',                                   role: 'Admin', cat: 'operational', desc: 'Allow lead time for printing/engraving.' },
    { title: 'COMMENCEMENT: Begin preparing program',                          role: 'HM',    cat: 'operational', desc: 'Graduate names, readings, music, order of service.' },
    { title: 'DOE Annual Survey (typically due in spring — confirm filing)',   role: 'Admin', cat: 'compliance' },
    { title: 'Late Application Deadline',                                      role: 'HM',    cat: 'admissions' },
    { title: 'Final reminders re: Walk for Life (Mar 6)',                      role: 'HM',    cat: 'comms' },
    { title: 'Final reminders re: Spring Break dates',                         role: 'HM',    cat: 'comms' },
    { title: 'Reminders re: Vision Dinner (April 9) — push before Easter',     role: 'Laura', cat: 'comms' },
    { title: 'Notify parents of end-of-year ceremonies',                       role: 'HM',    cat: 'comms', desc: 'Awards, Commencement May 20, Last Day May 26.' },
    { title: 'Notify graduating senior parents of cap and gown ordering',      role: 'HM',    cat: 'comms', desc: 'Sizes, deadlines, cost.' },
    { title: 'Email: Late Applications welcome',                               role: 'HM',    cat: 'comms' },
  ],
  apr: [
    { title: 'GALA ATTIRE: Final fit confirmation by Apr 5',                   role: 'Laura', cat: 'fundraising', desc: 'First day back from break.' },
    { title: 'Vision Dinner execution',                                        role: 'Laura', cat: 'fundraising', desc: 'Setup, AV, signage, family check-in, student roles, post-event thank-yous.' },
    { title: 'Decision: Prefect Election Results announcement',                role: 'HM',    cat: 'operational', desc: 'At Vision Dinner or de-conflict.' },
    { title: 'YEARBOOK: Finalized last week of April for May print',           role: 'Yearbook', cat: 'operational' },
    { title: 'COMMENCEMENT: Finalize liturgy worksheet for bishop',            role: 'HM',    cat: 'operational', desc: 'Send to his assistant; allow time for review before May 20.' },
    { title: 'Commencement planning intensifies',                              role: 'HM',    cat: 'operational', desc: 'Venue, program, gowns, graduation requirements.' },
    { title: 'Senior end-of-year requirements check',                          role: 'HM',    cat: 'operational', desc: 'Transcripts, service hours.' },
    { title: 'Sunbiz Annual Report — file by May 1 deadline',                  role: 'Admin', cat: 'compliance' },
    { title: 'Annual Gala execution (Vision Dinner = the gala)',               role: 'Laura', cat: 'fundraising' },
    { title: 'Finalize fundraising numbers; post-event thank-yous',            role: 'Laura', cat: 'fundraising' },
    { title: 'Update donor tracking',                                          role: 'Laura', cat: 'fundraising' },
    { title: 'Final reminders re: Vision Dinner (Apr 9)',                      role: 'HM',    cat: 'comms', desc: 'First day back from break + day-of morning.' },
    { title: 'Reminders re: Baccalaureate & Commencement (May 20)',            role: 'HM',    cat: 'comms' },
    { title: 'Reminders re: Last Day for Students (May 26)',                   role: 'HM',    cat: 'comms' },
    { title: 'Email: Gala results & thanks (post-event)',                      role: 'Laura', cat: 'comms' },
  ],
  may: [
    { title: 'YEARBOOK: Print delivery — distribute',                          role: 'Yearbook', cat: 'operational' },
    { title: 'Final Q4 grade close-out and report cards',                      role: 'HM',    cat: 'operational' },
    { title: 'Commencement run-of-show + rehearsal',                           role: 'HM',    cat: 'operational', desc: 'Day or two before May 20.' },
    { title: 'Year-end teacher contracts / re-signing for 2027–28 confirmed',  role: 'HM',    cat: 'governance' },
    { title: 'Plan and send summer enrichment to teachers',                    role: 'HM',    cat: 'operational', desc: 'Reading, formation resources, professional development.' },
    { title: 'Begin transition / handbook updates for 2027–28',                role: 'HM',    cat: 'governance' },
    { title: 'Update plaque on White Horse Cup',                               role: 'HM',    cat: 'operational' },
    { title: 'Register attendees for CSN Conference',                          role: 'Admin', cat: 'operational' },
    { title: 'Renew SUFS for next school year — finalize 2027–28 enrollment',  role: 'Admin', cat: 'compliance' },
    { title: 'Sunbiz Annual Report final deadline May 1 (verify filed)',       role: 'Admin', cat: 'compliance' },
    { title: 'Teacher contracts signed for 2027–28',                           role: 'HM',    cat: 'governance', desc: 'Lock in before summer.' },
    { title: 'Set up Praxis contracts and autobilling for next year',          role: 'Admin', cat: 'finance' },
    { title: 'Plan used uniform sale for incoming families',                   role: 'Laura', cat: 'operational' },
    { title: 'Final reminders re: Baccalaureate & Commencement (May 20)',      role: 'HM',    cat: 'comms' },
    { title: 'Final reminders re: Last Day (May 26)',                          role: 'HM',    cat: 'comms' },
    { title: 'Send summer communication plan',                                 role: 'HM',    cat: 'comms' },
    { title: 'Notify CSN conference attendees of conference details',          role: 'Admin', cat: 'comms', desc: 'Travel/accommodations.' },
  ],
  jun: [
    { title: 'Wrap up school year administrative close-out',                   role: 'Admin', cat: 'operational' },
    { title: 'Update Family Handbook for 2027–28',                             role: 'HM',    cat: 'governance' },
    { title: 'Update Employee Handbook for 2027–28',                           role: 'HM',    cat: 'governance' },
    { title: 'Update Abuse Policy as needed',                                  role: 'HM',    cat: 'governance' },
    { title: 'Begin planning summer gathering(s) for new and returning families', role: 'HM', cat: 'operational' },
    { title: 'FDLE Background Checks — renewals as needed',                    role: 'Admin', cat: 'compliance', desc: '5-year cycle per Jessica Lunsford Act.' },
    { title: 'Renew Surety Bond',                                              role: 'Admin', cat: 'compliance' },
    { title: 'Sunbiz Annual Report — verify filed',                            role: 'Admin', cat: 'compliance', desc: 'Deadline May 1; if missed, file ASAP with late fee.' },
    { title: 'SUFS Enrollment for 2027–28 (finalize)',                         role: 'Admin', cat: 'compliance' },
    { title: 'Begin Annual Survey (DOE) preparation if not yet filed',         role: 'Admin', cat: 'compliance' },
    { title: 'New Hire Reporting for any summer hires',                        role: 'Admin', cat: 'compliance' },
    { title: 'Faculty onboarding & annual docs prep for incoming hires',       role: 'HM',    cat: 'governance' },
    { title: 'Welcome Committee plans for summer outreach',                    role: 'HM',    cat: 'admissions' },
    { title: 'Summer gathering invitation(s)',                                 role: 'HM',    cat: 'comms', desc: 'Day 1 of teacher contract / family welcome.' },
  ],
};

// Quarterly Q.E. close-outs — scheduled to specific dates per the cadence.
const QUARTERLY = [
  { id: 'qe-q1', month: 'oct', title: 'Quarterly Q.E. close-out (Q1)',  role: 'HM', cat: 'operational', dueDate: '2026-10-09', desc: 'Q1 quarter-end close-out.' },
  { id: 'qe-q2', month: 'jan', title: 'Quarterly Q.E. close-out (Q2)',  role: 'HM', cat: 'operational', dueDate: '2027-01-15', desc: 'Q2 quarter-end close-out.' },
  { id: 'qe-q3', month: 'mar', title: 'Quarterly Q.E. close-out (Q3)',  role: 'HM', cat: 'operational', dueDate: '2027-03-12', desc: 'Q3 quarter-end close-out.' },
  { id: 'qe-q4', month: 'may', title: 'Quarterly Q.E. close-out (Q4)',  role: 'HM', cat: 'operational', dueDate: '2027-05-26', desc: 'Q4 quarter-end close-out.' },
];

// ────────── ASSEMBLE FINAL TASK LIST ──────────
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

export function buildSeedTasks() {
  const tasks = [];

  // Standing recurring (every month)
  STANDING_ALL_MONTHS.forEach(t => {
    ALL_MONTHS.forEach(m => {
      tasks.push({
        id: `standing-${slug(t.title)}-${m}`,
        month: m,
        title: t.title,
        description: t.desc || '',
        defaultRole: t.role,
        category: t.cat,
        recurring: true,
      });
    });
  });

  // SUFS invoicing — Aug-May only
  STANDING_AUG_MAY.forEach(t => {
    SCHOOL_YEAR_MONTHS.forEach(m => {
      tasks.push({
        id: `standing-${slug(t.title)}-${m}`,
        month: m,
        title: t.title,
        description: t.desc || '',
        defaultRole: t.role,
        category: t.cat,
        recurring: true,
      });
    });
  });

  // Per-month one-off tasks
  Object.entries(MONTH_TASKS).forEach(([month, list]) => {
    list.forEach((t, i) => {
      tasks.push({
        id: `${month}-${String(i).padStart(2, '0')}-${slug(t.title)}`,
        month,
        title: t.title,
        description: t.desc || '',
        defaultRole: t.role,
        category: t.cat,
        recurring: false,
      });
    });
  });

  // Quarterly with explicit dates
  QUARTERLY.forEach(t => {
    tasks.push({
      id: t.id,
      month: t.month,
      title: t.title,
      description: t.desc || '',
      defaultRole: t.role,
      category: t.cat,
      recurring: false,
      defaultDueDate: t.dueDate,
    });
  });

  return tasks;
}
