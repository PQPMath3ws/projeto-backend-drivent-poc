import { Address, Enrollment } from '@prisma/client';
import { request } from '@/utils/request';
import { invalidBodyDataError, invalidDataError, notFoundError } from '@/errors';
import addressRepository, { CreateAddressParams } from '@/repositories/address-repository';
import enrollmentRepository, { CreateEnrollmentParams } from '@/repositories/enrollment-repository';
import { exclude } from '@/utils/prisma-utils';

async function getAddressFromCEP(cep: string) {
  if (/^([0-9]{8}|[0-9]{5}-[0-9]{3})$/.test(cep)) {
    const result = await request.get(`${process.env.VIA_CEP_API}/${cep.replace('-', '')}/json/`);

    if (!result.data) throw notFoundError();

    const { bairro, complemento, uf, localidade, logradouro } = result.data as {
      bairro: string;
      complemento: string;
      uf: string;
      localidade: string;
      logradouro: string;
    };

    if (bairro && complemento && uf && localidade && logradouro)
      return { bairro, cidade: localidade, complemento, uf, logradouro };

    throw invalidBodyDataError('Invalid or Inexistent CEP.');
  } else {
    throw notFoundError();
  }
}

async function getOneWithAddressByUserId(userId: number): Promise<GetOneWithAddressByUserIdResult> {
  const enrollmentWithAddress = await enrollmentRepository.findWithAddressByUserId(userId);

  if (!enrollmentWithAddress) throw notFoundError();

  const [firstAddress] = enrollmentWithAddress.Address;
  const address = getFirstAddress(firstAddress);

  return {
    ...exclude(enrollmentWithAddress, 'userId', 'createdAt', 'updatedAt', 'Address'),
    ...(!!address && { address }),
  };
}

type GetOneWithAddressByUserIdResult = Omit<Enrollment, 'userId' | 'createdAt' | 'updatedAt'>;

function getFirstAddress(firstAddress: Address): GetAddressResult {
  if (!firstAddress) return null;

  return exclude(firstAddress, 'createdAt', 'updatedAt', 'enrollmentId');
}

type GetAddressResult = Omit<Address, 'createdAt' | 'updatedAt' | 'enrollmentId'>;

async function createOrUpdateEnrollmentWithAddress(params: CreateOrUpdateEnrollmentWithAddress) {
  const enrollment = exclude(params, 'address');
  const address = getAddressForUpsert(params.address);

  try {
    await getAddressFromCEP(address.cep);
  } catch {
    throw invalidDataError(['invalid CEP']);
  }

  const newEnrollment = await enrollmentRepository.upsert(params.userId, enrollment, exclude(enrollment, 'userId'));

  await addressRepository.upsert(newEnrollment.id, address, address);
}

function getAddressForUpsert(address: CreateAddressParams) {
  return {
    ...address,
    ...(address?.addressDetail && { addressDetail: address.addressDetail }),
  };
}

export type CreateOrUpdateEnrollmentWithAddress = CreateEnrollmentParams & {
  address: CreateAddressParams;
};

const enrollmentsService = {
  getOneWithAddressByUserId,
  createOrUpdateEnrollmentWithAddress,
  getAddressFromCEP,
};

export default enrollmentsService;
