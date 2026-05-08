/**
 * Pure row-to-SharePoint-fields mappers, shared by bulk sync (sharepoint.ts)
 * and per-item auto-sync (sharepoint-item-sync.ts).
 *
 * Keep these in sync with LIST_DEFINITIONS in sharepoint.ts — every key
 * returned must match a column name there or SharePoint will reject the
 * insert with "Field 'X' is not recognized".
 *
 * The "joined" mappers (referrals, interactions, tasks) expect the row to
 * already include denormalized fields like physician_first_name. The bulk
 * sync produces these via SQL JOINs; the item-sync helper does the same
 * with a single-row JOIN.
 */

export function mapPhysicianFields(p: any) {
  return {
    Title: `${p.lastName ?? p.last_name ?? ''}, ${p.firstName ?? p.first_name ?? ''}`,
    ExternalId: p.id,
    FirstName: p.firstName ?? p.first_name ?? '',
    LastName: p.lastName ?? p.last_name ?? '',
    Credentials: p.credentials ?? '',
    Specialty: p.specialty ?? '',
    NPI: p.npi ?? '',
    PracticeName: p.practiceName ?? p.practice_name ?? '',
    Address: p.primaryOfficeAddress ?? p.primary_office_address ?? '',
    City: p.city ?? '',
    State: p.state ?? '',
    Zip: p.zip ?? '',
    Phone: p.phone ?? '',
    Fax: p.fax ?? '',
    Email: p.email ?? '',
    Status: p.status ?? '',
    RelationshipStage: p.relationshipStage ?? p.relationship_stage ?? '',
    Priority: p.priority ?? '',
    Notes: p.notes ?? '',
    LastInteractionAt: (p.lastInteractionAt ?? p.last_interaction_at)
      ? new Date(p.lastInteractionAt ?? p.last_interaction_at).toISOString()
      : '',
  };
}

export function mapReferralFields(r: any) {
  const physicianFirst = r.physician_first_name;
  const physicianLast = r.physician_last_name;
  const physicianName = physicianFirst && physicianLast
    ? `${physicianLast}, ${physicianFirst}`
    : (r.referring_provider_name ?? '');
  return {
    Title: r.case_title ?? r.patient_account_number ?? 'Referral',
    ExternalId: r.id,
    PhysicianName: physicianName,
    PhysicianNPI: r.physician_npi ?? r.referring_provider_npi ?? '',
    LocationName: r.location_name ?? '',
    ReferralDate: r.referral_date ?? '',
    PatientAccount: r.patient_account_number ?? '',
    PatientName: r.patient_full_name ?? '',
    CaseTitle: r.case_title ?? '',
    CaseTherapist: r.case_therapist ?? '',
    ReferralSource: r.referral_source ?? '',
    Status: r.status ?? '',
    Discipline: r.discipline ?? '',
    DiagnosisCategory: r.diagnosis_category ?? '',
    PrimaryInsurance: r.primary_insurance ?? '',
    PrimaryPayerType: r.primary_payer_type ?? '',
    ScheduledVisits: r.scheduled_visits ?? 0,
    ArrivedVisits: r.arrived_visits ?? 0,
    DischargeDate: r.discharge_date ?? '',
    DischargeReason: r.discharge_reason ?? '',
    DateOfInitialEval: r.date_of_initial_eval ?? '',
  };
}

export function mapInteractionFields(r: any) {
  const physicianFirst = r.physician_first_name;
  const physicianLast = r.physician_last_name;
  return {
    Title: `${r.type ?? ''} - ${physicianLast ?? 'Unknown'}`,
    ExternalId: r.id,
    PhysicianName: physicianFirst && physicianLast ? `${physicianLast}, ${physicianFirst}` : '',
    UserName: r.user_name ?? '',
    Type: r.type ?? '',
    OccurredAt: r.occurred_at ? new Date(r.occurred_at).toISOString() : '',
    Summary: r.summary ?? '',
    NextStep: r.next_step ?? '',
    FollowUpDueAt: r.follow_up_due_at ? new Date(r.follow_up_due_at).toISOString() : '',
  };
}

export function mapTaskFields(r: any) {
  const physicianFirst = r.physician_first_name;
  const physicianLast = r.physician_last_name;
  const description: string = r.description ?? '';
  return {
    Title: description.substring(0, 100) || 'Task',
    ExternalId: r.id,
    PhysicianName: physicianFirst && physicianLast ? `${physicianLast}, ${physicianFirst}` : '',
    AssignedTo: r.user_name ?? '',
    DueAt: r.due_at ? new Date(r.due_at).toISOString() : '',
    Priority: r.priority ?? '',
    Status: r.status ?? '',
    Description: description,
  };
}

export function mapLocationFields(l: any) {
  // IsActive intentionally stringified — LIST_DEFINITIONS declares it as
  // `text` not `boolean` so the SharePoint column accepts strings only.
  // Zip/Fax not yet in LIST_DEFINITIONS — add columns there first if you
  // want them mirrored to SharePoint.
  const active = l.isActive ?? l.is_active ?? false;
  return {
    Title: l.name,
    ExternalId: l.id,
    LocationName: l.name ?? '',
    Address: l.address ?? '',
    City: l.city ?? '',
    State: l.state ?? '',
    Phone: l.phone ?? '',
    IsActive: active ? 'Yes' : 'No',
  };
}
