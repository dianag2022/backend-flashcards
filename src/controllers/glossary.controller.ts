import { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../constants/collections';
import { GlossaryTerm, GlossaryTermBody } from '../types/glossary.types';
import { toIsoString } from '../utils/firestore';

function mapGlossaryTerm(id: string, data: FirebaseFirestore.DocumentData): GlossaryTerm {
  return {
    id,
    term: data.term,
    definition: data.definition,
    updatedAt: toIsoString(data.updatedAt),
  };
}

function parseGlossaryTermBody(body: unknown): GlossaryTermBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const { term, definition } = body as Record<string, unknown>;

  if (typeof term !== 'string' || !term.trim()) {
    return null;
  }

  if (typeof definition !== 'string' || !definition.trim()) {
    return null;
  }

  return {
    term: term.trim(),
    definition: definition.trim(),
  };
}

async function listGlossaryTerms(res: Response): Promise<void> {
  const snapshot = await db.collection(COLLECTIONS.GLOSSARY).get();
  const terms = snapshot.docs
    .map((doc) => mapGlossaryTerm(doc.id, doc.data()))
    .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));

  res.status(200).json({ terms });
}

export async function listPublishedGlossary(_req: Request, res: Response): Promise<void> {
  try {
    await listGlossaryTerms(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to fetch glossary: ${message}`,
    });
  }
}

export async function listAdminGlossary(_req: Request, res: Response): Promise<void> {
  try {
    await listGlossaryTerms(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to fetch glossary: ${message}`,
    });
  }
}

export async function createGlossaryTerm(req: Request, res: Response): Promise<void> {
  const payload = parseGlossaryTermBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'term and definition (non-empty strings) are required',
    });
    return;
  }

  try {
    const docRef = await db.collection(COLLECTIONS.GLOSSARY).add({
      term: payload.term,
      definition: payload.definition,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const created = await docRef.get();
    res.status(201).json({ term: mapGlossaryTerm(created.id, created.data()!) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to create glossary term: ${message}`,
    });
  }
}

export async function updateGlossaryTerm(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const payload = parseGlossaryTermBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'term and definition (non-empty strings) are required',
    });
    return;
  }

  try {
    const docRef = db.collection(COLLECTIONS.GLOSSARY).doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
      res.status(404).json({
        error: 'Not Found',
        message: `Glossary term not found: ${id}`,
      });
      return;
    }

    await docRef.update({
      term: payload.term,
      definition: payload.definition,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updated = await docRef.get();
    res.status(200).json({ term: mapGlossaryTerm(updated.id, updated.data()!) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to update glossary term: ${message}`,
    });
  }
}

export async function deleteGlossaryTerm(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);

  try {
    const docRef = db.collection(COLLECTIONS.GLOSSARY).doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
      res.status(404).json({
        error: 'Not Found',
        message: `Glossary term not found: ${id}`,
      });
      return;
    }

    await docRef.delete();

    res.status(200).json({
      message: 'Glossary term deleted successfully',
      termId: id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to delete glossary term: ${message}`,
    });
  }
}