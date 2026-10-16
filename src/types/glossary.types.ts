export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  updatedAt: string;
}

export interface GlossaryTermBody {
  term: string;
  definition: string;
}

export interface GlossaryListResponse {
  terms: GlossaryTerm[];
}

export interface GlossaryTermResponse {
  term: GlossaryTerm;
}