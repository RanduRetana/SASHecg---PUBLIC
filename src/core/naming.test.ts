import { expect, test } from 'bun:test'
import { batchZipName, fileStem, pageFileName, pageOutputName, planOutputNames, zipFileName } from './naming'

test('page names are stable and use at least three digits', () => {
  expect(pageFileName(1, 100)).toBe('ecg-001.pdf')
  expect(pageFileName(12, 20)).toBe('ecg-012.pdf')
  expect(pageFileName(100, 100)).toBe('ecg-100.pdf')
  expect(pageFileName(1, 1000)).toBe('ecg-0001.pdf')
  expect(pageFileName(42, 1000)).toBe('ecg-0042.pdf')
})

test('the ZIP uses the original name, without a path or extension', () => {
  expect(zipFileName('report-ecg.pdf')).toBe('report-ecg-anonymized.zip')
  expect(zipFileName('Report ECG.PDF')).toBe('Report-ECG-anonymized.zip')
  expect(zipFileName('folder/march ecg.pdf')).toBe('march-ecg-anonymized.zip')
  expect(zipFileName('C:\\downloads\\shift.12.pdf')).toBe('shift.12-anonymized.zip')
  expect(zipFileName('   .pdf')).toBe('report-anonymized.zip')
})

test('batch names keep the source stem and disambiguate duplicates', () => {
  expect(fileStem('Clinic A.PDF')).toBe('Clinic-A')
  expect(pageOutputName('Clinic-A', 1, 12)).toBe('Clinic-A-ecg-001.pdf')
  const plan = planOutputNames([
    { name: 'ward.pdf', pageCount: 2 },
    { name: 'ward.pdf', pageCount: 1 },
    { name: 'icu.pdf', pageCount: 3 },
  ])
  expect(plan[0]?.names).toEqual(['ward-1-ecg-001.pdf', 'ward-1-ecg-002.pdf'])
  expect(plan[1]?.names).toEqual(['ward-2-ecg-001.pdf'])
  expect(plan[2]?.names).toEqual(['icu-ecg-001.pdf', 'icu-ecg-002.pdf', 'icu-ecg-003.pdf'])
  expect(plan[0]?.disambiguated).toBe(true)
  expect(plan[2]?.disambiguated).toBe(false)
  expect(new Set(plan.flatMap((file) => file.names)).size).toBe(6)
  expect(batchZipName(['ward.pdf'])).toBe('ward-anonymized.zip')
  expect(batchZipName(['a.pdf', 'b.pdf'])).toBe('redactly-anonymized.zip')
})
