export interface KepwareWriteParams {
  targetFacility: string; // 대상 설비, ex) "STACK01.LOAD_PORT11"
  tagName: string; // 태그 이름, ex) "Call_Request"
  value: string; // 값, ex) "1"
}
