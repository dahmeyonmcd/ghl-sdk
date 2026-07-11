/**
 * Every webhook event `type` GHL emits, sourced from `docs/webhook events/*.md` in the
 * highlevel-api-docs submodule.
 */
export type WebhookEventType =
  | 'AppInstall'
  | 'AppUninstall'
  | 'AppointmentCreate'
  | 'AppointmentDelete'
  | 'AppointmentUpdate'
  | 'AssociationCreate'
  | 'AssociationDelete'
  | 'AssociationUpdate'
  | 'CampaignStatusUpdate'
  | 'ContactCreate'
  | 'ContactDelete'
  | 'ContactDndUpdate'
  | 'ContactTagUpdate'
  | 'ContactUpdate'
  | 'ConversationUnreadWebhook'
  | 'InboundMessage'
  | 'InvoiceCreate'
  | 'InvoiceDelete'
  | 'InvoicePaid'
  | 'InvoicePartiallyPaid'
  | 'InvoiceSent'
  | 'InvoiceUpdate'
  | 'InvoiceVoid'
  | 'LCEmailStats'
  | 'LocationCreate'
  | 'LocationUpdate'
  | 'NoteCreate'
  | 'NoteDelete'
  | 'NoteUpdate'
  | 'ObjectSchemaCreate'
  | 'ObjectSchemaUpdate'
  | 'OpportunityAssignedToUpdate'
  | 'OpportunityCreate'
  | 'OpportunityDelete'
  | 'OpportunityMonetaryValueUpdate'
  | 'OpportunityStageUpdate'
  | 'OpportunityStatusUpdate'
  | 'OpportunityUpdate'
  | 'OrderCreate'
  | 'OrderStatusUpdate'
  | 'OutboundMessage'
  | 'PlanChange'
  | 'PriceCreate'
  | 'PriceDelete'
  | 'PriceUpdate'
  | 'ProductCreate'
  | 'ProductDelete'
  | 'ProductUpdate'
  | 'ProviderOutboundMessage'
  | 'RecordCreate'
  | 'RecordDelete'
  | 'RecordUpdate'
  | 'RelationCreate'
  | 'RelationDelete'
  | 'TaskComplete'
  | 'TaskCreate'
  | 'TaskDelete'
  | 'UserCreate';

/** Common shape across all webhook payloads. Bodies vary per event type, so we narrow on `type` and leave the rest loose rather than modeling all 50+ shapes by hand. */
export interface GhlWebhookEvent<TType extends WebhookEventType = WebhookEventType> {
  type: TType;
  locationId?: string;
  companyId?: string;
  webhookId?: string;
  timestamp?: string;
  [key: string]: unknown;
}
