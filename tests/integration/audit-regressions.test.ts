import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { transaction, readDatabase } from '../../src/lib/data/repository';
import { canonicalStudent, registrationFor, applicationFor, submissionSheetRow } from '../../src/lib/admissions/service';
import { POST as verifyWorkshop } from '../../src/app/api/candidate-access/verify-workshop/route';
import { POST as eligibility } from '../../src/app/api/admin/eligibility/route';
import { POST as decisionPost, GET as decisionGet } from '../../src/app/api/admin/final-results/route';
import { SESSION_COOKIE, signSession } from '../../src/lib/security/session';
import { evaluateCandidates } from '../../src/lib/eligibility/engine';
import { googleSheetsService } from '../../src/lib/google/sheets-service';
import { googleRequest } from '../../src/lib/google/oauth';
import { POST as interviewPost, GET as interviewGet } from '../../src/app/api/admin/interviews/route';
import { POST as notificationPost } from '../../src/app/api/admin/notifications/route';
vi.mock('../../src/lib/google/oauth', () => ({ googleRequest: vi.fn() }));

let directory: string, staff: string, studentId: string, registrationId: string, reference: string, campaignId: string, slug: string;
const request = (url: string, body?: any, admin = true) => new NextRequest('http://localhost:3000' + url, { method: body ? 'POST' : 'GET', headers: { ...(admin ? { Cookie: staff } : {}), ...(body ? {'Content-Type':'application/json'} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) });
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'tic-review-'));
  vi.stubEnv('DATA_DIR', directory); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://mock.supabase.co'); vi.stubEnv('SEED_DEMO_DATA', 'false'); vi.stubEnv('APP_SECRET', 'audit-only-test-key-longer-than-thirty-two-characters');
  staff = SESSION_COOKIE + '=' + signSession({email:'audit@example.com',name:'Audit',role:'super_admin'});
  await transaction(db => {
    const student = canonicalStudent({fullName:'Audit Student',email:'audit-student@example.com',nic:'200012345601',phone:'0771234501',district:'Jaffna'});
    const registration = registrationFor(student); studentId=student.id; registrationId=registration.id; reference=registration.reference_no; campaignId=registration.campaign_id;
    const form=db.customForms[0]; form.type='workshop_rsvp'; form.is_active=true; form.status='published'; form.starts_at=undefined; form.closes_at=undefined; form.submission_limit=undefined; slug=form.slug;
  });
});
afterEach(async()=>{vi.restoreAllMocks();vi.clearAllMocks();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});});

it('R1: invalid workshop verifications persist counters and the ninth attempt is limited', async()=>{
  const statuses=[];
  for(let i=0;i<9;i++) statuses.push((await verifyWorkshop(request('/api/candidate-access/verify-workshop',{reference,email:'wrong@example.com',formSlug:slug},false),undefined)).status);
  expect(statuses).toEqual([...Array(8).fill(401), 429]);
  expect((await readDatabase()).candidateAccessAttempts).toHaveLength(2);
});

it('R2: a narrow resync preserves existing answer and staff-note columns',async()=>{
  const writes:any[]=[];
  vi.mocked(googleRequest).mockImplementation(async (url,init)=>{
    if(url.includes('?fields=')) return {sheets:[{properties:{title:'Registrations'}}]};
    if(!init) return {values:[['referenceNo','fullName','customAnswer','staffNote'],['REG-TEST','Audit Student','Keep this answer','Call tomorrow']]};
    writes.push(JSON.parse(String(init.body))); return {};
  });
  expect((await googleSheetsService.syncRecords('test-sheet','registrations',[{referenceNo:'REG-TEST',fullName:'Audit Student'}])).success).toBe(true);
  expect(writes[0].data.find((item:any)=>item.range.endsWith('A2')).values[0]).toEqual(['REG-TEST','Audit Student','Keep this answer','Call tomorrow']);
});

it('R3: two forms with one registration reference retain separate stable response rows',async()=>{
  const writes:any[]=[];
  vi.mocked(googleRequest).mockImplementation(async(url,init)=>{
    if(url.includes('?fields=')) return {sheets:[{properties:{title:'Registrations'}}]};
    if(!init) return {values:[]}; writes.push(JSON.parse(String(init.body))); return {};
  });
  const db=await readDatabase();
  const rows=['registration','workshop'].map((id)=>submissionSheetRow(db.students[0],db.registrations[0],undefined,{id,form_id:id,reference_no:reference,data:{formAnswer:id+' answer'},student_id:studentId,registration_id:registrationId,synced_to_sheet:false,email_sent:false,created_at:new Date().toISOString()}));
  const result=await googleSheetsService.syncRecords('test-sheet','registrations',rows);
  expect(result.syncedCount).toBe(2);
  expect(writes.find(w=>w.values).values).toHaveLength(2);
  expect(writes.find(w=>w.values).values[0]).toContain('registration answer');
  expect(writes.find(w=>w.values).values[1]).toContain('workshop answer');
});

it('R4: configured tie-breakers select the correct candidate at the cutoff',()=>{
  const base={registrationRef:'REG',studentExamId:'UT011000',district:'Jaffna',hasAttendedWorkshop:true,hasSubmittedApplication:true,examScore:80};
  const candidates=[{...base,studentId:'a',studentName:'A Student',alZScore:0.5,registrationDate:'2026-10-30'}, {...base,studentId:'z',studentName:'Z Student',alZScore:2,registrationDate:'2026-10-01'}];
  for(const tieBreakRule of ['higher_al_results','earlier_registration'] as const) {
    const report=evaluateCandidates(candidates,{minExamScore:50,requireWorkshopAttendance:true,requireApplicationSubmission:true,maxShortlistCount:1,tieBreakRule});
    expect(report.eligibleCandidates[0].studentId).toBe('z');
  }
});

it('R5: under_review applications remain eligible',async()=>{
  await transaction(db=>{
    const app=applicationFor(db.students[0],db.registrations[0],{});app.status='under_review';
    db.exams.push({id:'exam-review',campaign_id:campaignId,name:'Exam',exam_date:'2026-10-30',max_marks:100,pass_mark:50,weightage:100,requires_workshop_attendance:false,status:'imported'});
    db.examResults.push({id:'result-review',exam_id:'exam-review',student_id:studentId,student_exam_id:'UT011000',raw_score:90,calculated_score:90,is_passed:true,anomalies:[]});
  });
  const response=await eligibility(request('/api/admin/eligibility',{campaignId,requireWorkshopAttendance:false}),undefined);
  expect(response.status).toBe(200);
  const {report}=await response.json();expect(report.totalEligible).toBe(1);expect(report.ineligibleCandidates).toHaveLength(0);
});

it('R6: returning to an earlier decision queues a new revision once',async()=>{
  const update=async(finalStatus:string)=>{const r=await decisionPost(request('/api/admin/final-results',{action:'update_decision',studentId,campaignId,finalStatus}),undefined);expect(r.status).toBe(200);};
  const notify=async()=>{const r=await decisionPost(request('/api/admin/final-results',{action:'send_notifications',campaignId}),undefined);expect(r.status).toBe(200);return r.json();};
  await update('selected');expect((await notify()).sentCount).toBe(1);
  await update('unsuccessful');await update('selected');
  expect((await notify()).sentCount).toBe(1);
  expect((await notify()).sentCount).toBe(0);
  const db=await readDatabase();expect(db.outbox).toHaveLength(2);expect(db.outbox[0].error_code).toBe('DECISION_SUPERSEDED');expect(db.selectionDecisions[0].notification_status).toBe('pending');
});

it('R7: final results use only the selected intake exam score and course',async()=>{
  await transaction(db=>{
    const second={...db.campaigns[0],id:'next-intake',title:'Next intake'};db.campaigns.push(second);
    const r2=registrationFor(db.students[0],second.id);
    const a1=applicationFor(db.students[0],db.registrations[0],{});a1.course_id='old-course';
    const a2=applicationFor(db.students[0],r2,{});a2.course_id='new-course';
    db.exams.push({id:'old-exam',campaign_id:campaignId,name:'Old',exam_date:'2026-10-01',max_marks:100,pass_mark:50,weightage:100,requires_workshop_attendance:false,status:'imported'},{id:'new-exam',campaign_id:second.id,name:'New',exam_date:'2026-10-30',max_marks:100,pass_mark:50,weightage:100,requires_workshop_attendance:false,status:'imported'});
    db.examResults.push({id:'old-score',exam_id:'old-exam',student_id:studentId,student_exam_id:'OLD',raw_score:40,calculated_score:40,is_passed:false,anomalies:[]},{id:'new-score',exam_id:'new-exam',student_id:studentId,student_exam_id:'NEW',raw_score:90,calculated_score:90,is_passed:true,anomalies:[]});
    db.selectionDecisions.push({id:'decision-new',student_id:studentId,campaign_id:second.id,final_status:'selected',notification_status:'pending',approved_by:'audit',approved_at:new Date().toISOString()});
  });
  const result=await(await decisionGet(request('/api/admin/final-results'),undefined)).json();
  expect(result.decisions[0]).toMatchObject({campaign_id:'next-intake',examScore:90,courseId:'new-course'});
});

it('R1 concurrent mismatches share the durable limit; valid pairs and invalid targets are counted', async () => {
  const responses = await Promise.all(Array.from({length: 10}, () => verifyWorkshop(request('/api/candidate-access/verify-workshop', {reference, email:'wrong@example.com', formSlug:slug}, false), undefined)));
  expect(responses.filter(response => response.status === 401)).toHaveLength(8);
  expect(responses.filter(response => response.status === 429)).toHaveLength(2);
  const valid = await verifyWorkshop(request('/api/candidate-access/verify-workshop', {reference, email:'audit-student@example.com', formSlug:slug}, false), undefined);
  expect(valid.status).toBe(200); expect(valid.headers.get('set-cookie')).toContain('HttpOnly');
  const missing = await verifyWorkshop(request('/api/candidate-access/verify-workshop', {reference, email:'absent@example.com', formSlug:'missing-form'}, false), undefined);
  expect(missing.status).toBe(404);
  expect((await readDatabase()).candidateAccessAttempts).toHaveLength(4);
});

it('R2 explicit empty or null values clear only the requested cells', async () => {
  const writes:any[]=[];
  vi.mocked(googleRequest).mockImplementation(async (url,init)=>{
    if(url.includes('?fields=')) return {sheets:[{properties:{title:'Registrations'}}]};
    if(!init) return {values:[['referenceNo','answer','notes','untouched'],['REG-TEST','Old answer','Old notes','Keep']]};
    writes.push(JSON.parse(String(init.body))); return {};
  });
  await googleSheetsService.syncRecords('test-sheet','registrations',[{referenceNo:'REG-TEST',answer:'',notes:null}]);
  expect(writes[0].data[1].values[0]).toEqual(['REG-TEST','','','Keep']);
});

it.each(['submitted','under_review','approved','invited','started','rejected','withdrawn'] as const)('R5 application status %s follows the submission policy',async status=>{
  await transaction(db=>{
    applicationFor(db.students[0],db.registrations[0],{}).status=status;
    db.exams.push({id:'exam',campaign_id:campaignId,name:'Exam',exam_date:'2026-10-30',max_marks:100,pass_mark:50,weightage:100,requires_workshop_attendance:false,status:'imported'});
    db.examResults.push({id:'result',exam_id:'exam',student_id:studentId,student_exam_id:'UT011000',raw_score:90,calculated_score:90,is_passed:true,anomalies:[]});
  });
  const result=await(await eligibility(request('/api/admin/eligibility',{campaignId,requireWorkshopAttendance:false}),undefined)).json();
  expect(result.report.totalEligible).toBe(['submitted','under_review','approved'].includes(status)?1:0);
});

it('R6 rejects stale editors, superseded retries and changes during uncertain delivery', async()=>{
  const update = (body: Record<string,unknown>) => decisionPost(request('/api/admin/final-results',{action:'update_decision',studentId,campaignId,finalStatus:'selected',...body}),undefined);
  const initial=await(await update({expectedDecisionId:null})).json();
  expect((await update({expectedDecisionId:null})).status).toBe(409);
  expect((await update({expectedDecisionId:'other-decision',expectedRevision:1})).status).toBe(409);
  await decisionPost(request('/api/admin/final-results',{action:'send_notifications',campaignId}),undefined);
  await update({finalStatus:'unsuccessful',expectedRevision:1});
  expect((await update({expectedRevision:1})).status).toBe(409);
  const old=(await readDatabase()).outbox[0];
  expect((await notificationPost(request('/api/admin/notifications',{action:'retry',jobId:old.id}),undefined)).status).toBe(409);
  await transaction(db=>{db.outbox[0].status='uncertain';});
  expect((await update({expectedDecisionId:initial.decision.id,expectedRevision:2})).status).toBe(409);
});

it('R10 completes an empty intake through session, assignment, scoring and draft decision APIs', async()=>{
  const call = (body: Record<string,unknown>) => interviewPost(request('/api/admin/interviews',body),undefined);
  const empty = await(await interviewGet(request('/api/admin/interviews'),undefined)).json();
  expect(empty.interviews).toHaveLength(0); expect(empty.candidates[0].reference).toBe(reference);
  const created = await(await call({action:'create_session',campaignId,title:'Admissions interviews',date:'2026-11-05T03:30:00Z',venue:'Campus',panelMembers:['Panel member']})).json();
  const assigned = await call({action:'assign_candidates',interviewId:created.interview.id,studentIds:[studentId]});
  expect(assigned.status).toBe(200); expect((await assigned.json()).assignedCount).toBe(1);
  expect((await(await call({action:'assign_candidates',interviewId:created.interview.id,studentIds:[studentId]})).json()).assignedCount).toBe(0);
  let db=await readDatabase(); expect(db.outbox).toHaveLength(1);
  const scored=await call({action:'submit_evaluation',candidateId:db.interviewCandidates[0].id,expectedSubmittedAt:null,interviewerName:'Ignored client name',communicationScore:20,technicalScore:30,analyticalScore:20,overallScore:10,recommendation:'recommend',notes:'Reviewed'});
  expect(scored.status).toBe(200);
  const draft=await decisionPost(request('/api/admin/final-results',{action:'update_decision',studentId,campaignId,expectedDecisionId:null,finalStatus:'pending_decision',compositeScore:80}),undefined);
  expect(draft.status).toBe(200);
  db=await readDatabase(); expect(db.interviewEvaluations[0].interviewer_name).toBe('Audit'); expect(db.outbox).toHaveLength(1); expect(db.selectionDecisions[0].final_status).toBe('pending_decision');
});

it('R10 rejects another intake and occupied slots, including requests mixing existing and new candidates',async()=>{
  let otherId='';
  await transaction(db=>{
    const student=canonicalStudent({fullName:'Second Student',email:'second@example.com',nic:'200012345602',phone:'0771234502',district:'Jaffna'}); otherId=student.id;
    db.campaigns.push({...db.campaigns[0],id:'other'}); registrationFor(student,'other');
    db.interviews.push({id:'session',campaign_id:campaignId,title:'Panel',date:'2026-11-05T03:30:00Z',venue:'Campus',panel_members:['Audit'],status:'scheduled'});
    db.interviewCandidates.push({id:'assigned',student_id:studentId,interview_id:'session',status:'invited',time_slot:'2026-11-05T03:30:00Z'});
  });
  const assign=()=>interviewPost(request('/api/admin/interviews',{action:'assign_candidates',interviewId:'session',studentIds:[studentId,otherId]}),undefined);
  expect((await assign()).status).toBe(400);
  await transaction(db=>{registrationFor(db.students.find(s=>s.id===otherId)!,campaignId);});
  expect((await assign()).status).toBe(409);
  expect((await readDatabase()).interviewCandidates).toHaveLength(1);
});
