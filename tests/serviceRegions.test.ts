import {
  findServiceRegion,
  getRegionSearchViewbox,
  getServiceRegion,
} from '@/src/constants/serviceRegions';

describe('service regions', () => {
  it('recognises Klang Valley and Sandakan discovery locations', () => {
    expect(findServiceRegion(3.139, 101.6869)?.id).toBe('klang-valley');
    expect(findServiceRegion(5.8394, 118.1178)?.id).toBe('sandakan');
  });

  it('rejects locations outside the supported discovery regions', () => {
    expect(findServiceRegion(5.9804, 116.0735)).toBeNull();
  });

  it('keeps delivery limited to Klang Valley while Sandakan supports pickup discovery', () => {
    expect(getServiceRegion('klang-valley').deliveryAvailable).toBe(true);
    expect(getServiceRegion('sandakan').deliveryAvailable).toBe(false);
  });

  it('provides a bounded search viewbox for each region', () => {
    expect(getRegionSearchViewbox('klang-valley')).toBe('101.2,3.55,102,2.75');
    expect(getRegionSearchViewbox('sandakan')).toBe('117.7,6.2,118.6,5.45');
  });
});
