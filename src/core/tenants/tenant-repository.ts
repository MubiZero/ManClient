import { prisma } from "@/core/database/prisma";

type CreateBusinessInput = {
  id?: string;
  name: string;
  slug: string;
};

type CreateBranchInput = {
  businessId: string;
  name: string;
  slug: string;
};

export async function createBusiness(input: CreateBusinessInput) {
  return prisma.business.upsert({
    where: { slug: input.slug },
    create: input,
    update: { name: input.name },
  });
}

export async function createBranch(input: CreateBranchInput) {
  return prisma.branch.upsert({
    where: {
      businessId_slug: {
        businessId: input.businessId,
        slug: input.slug,
      },
    },
    create: input,
    update: { name: input.name },
  });
}

export async function listBranches(businessId: string) {
  return prisma.branch.findMany({
    where: { businessId },
    orderBy: { name: "asc" },
  });
}
