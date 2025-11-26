export interface PlcWriteParams {
  targetFacility: string; // 대상 설비, ex) "SC11"
  tagName: string; // 태그 이름, ex) "Call_Request"
  value: string; // 값, ex) "1"
}
