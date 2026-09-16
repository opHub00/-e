"""Offline, reviewed transcription of one exact HWP revision. Not a runtime registry.
First run extract-hwp-text.py to .cache/samdo-hwp.json. No inferred income amounts.
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = json.loads((root/'.cache/samdo-hwp.json').read_text(encoding='utf-8'))
SHA = 'bd67d7ee6c9b9dbbe043f9c966679c791185ba0f21ae80050a33a489112e8763'
assert source['sha256'] == SHA, 'Different source: repeat document review, do not reuse this transcription'
p = source['paragraphs']
A='bade0617-63c6-4f61-86bf-6cd5ae17b101'
D='bade0617-63c6-4f61-86bf-6cd5ae17d101'
S='bade0617-63c6-4f61-86bf-6cd5ae17a101'
params={'youth.workPeriodBasis':'tax','dates.calculatedNoHome':True,'children.includeUnborn':True,'children.minorAgeYears':19,'amounts.integerWon':True,'exceptions.childbirthAfter':'2023-03-28',
        'region.localMonths':12,'region.localPercent':100,'region.otherPercent':0,'region.underReview':True,
        'source.managementNumberCandidates':'2026000434,2026000435','source.managementNumberMapping':'UNCONFIRMED',
        'youth.priorityPercent':30,'newlywed.priorityPercent':30,'newlywed.generalPercent':60,
        'firstHome.priorityPercent':70,'firstHome.generalPercent':20,'selection.rounding':'CEIL','selection.tieBreak':'LOTTERY',
        'warning.selection':'공급단계는 최초 진입 단계예요. 낙첨 시 후속 단계에 포함되며, 가점 동점자는 추첨합니다.',
        'warning.draft':'공급 세대수·일정·기관추천 등 미완성 표기는 계산하지 않았어요. 출산·혼인·군인 특례는 별도 확인이 필요해요.'}
# Exact printed amounts, including 1-won rounding; never multiply a base by a percentage.
starts={'70':2153,'80':2160,'100':2312,'110':2175,'120':2320,'130':2328,'140':2336,'200':2352}
income={}
for percent,start in starts.items():
    income[percent]=[int(p[i]['text'].replace(',','').removesuffix('원')) for i in range(start,start+6)]
    for size,amount in zip(range(3,9),income[percent]): params[f'income.{size}.{percent}']=amount
assert income['100']==[7533763,8802202,9326985,9906263,10485541,11064819]
assert [p[i]['text'] for i in [1333,1335,1337]]==['2,669,354원','3,813,363원','5,338,708원']
rows=[]
def eq(f,v=True): return {'fact':f,'op':'eq','value':v}
def ge(f,v): return {'fact':f,'op':'gte','value':v}
def le(f,v): return {'fact':f,'op':'lte','value':v}
def all_(*xs): return {'all':list(xs)}
def any_(*xs): return {'any':list(xs)}
def ev(key,label,ids,table=None):
    return {'id':'samdo.v17.'+key,'documentId':D,'source':'삼도이동 토지임대부 모집공고 VER1.7 검토본',
            'section':'Ⅴ. 신청자격 및 당첨자 선정방법' if min(ids)>=1766 else 'Ⅳ. 신청기준 및 공통 유의사항',
            'label':label,'tableLabel':table,'pageNumber':None,'textExcerpt':'\n'.join(p[i]['text'] for i in ids),
            'sourceUrl':None,'locator':{'sha256':SHA,'paragraphs':[{'index':i,'stream':p[i]['stream'],'offset':p[i]['offset']} for i in ids]}}
def cond(t,key,label,expr,ids,table=None,stage=None,review=False,docs=None):
    if key=='income' and t!='youth':
        ids=list(dict.fromkeys(ids+[i for start in starts.values() for i in range(start,start+6)]))
    key=t+'.'+(stage+'.' if stage else '')+key
    config={'label':label,'expression':expr,'documents':docs or []}
    if review: config['onFailure']='REVIEW'
    rows.append({'ruleKey':key,'supplyType':t,'stage':stage,'category':'STAGE' if stage else 'ELIGIBILITY','config':config,'evidence':ev(key,label,ids,table)})
    return key
def score(t,st,key,label,fact,bands,ids,table):
    key=f'{t}.{st}.{key}'
    rows.append({'ruleKey':key,'supplyType':t,'stage':st,'category':'SCORE','config':{'label':label,'fact':fact,'bands':bands},'evidence':ev(key,label,ids,table)})
    return key
def bands(*items): return [{'min':lo,**({'max':hi} if hi is not None else {}),'points':pts} for lo,hi,pts in items]
def limit(single,dual):
    return any_(*[all_(eq('incomeHouseholdSize',n), any_(all_(eq('dualIncome',False),le('householdIncome',{'parameter':f'income.{n}.{single}'})),all_(eq('dualIncome'),le('householdIncome',{'parameter':f'income.{n}.{dual}'})))) for n in range(3,9)])
def common(t):
    adult=[] if t=='youth' else [cond(t,'adult','만 19세 이상(미성년 세대주 예외는 별도 확인)',ge('age',19),[268,1110],review=True)]
    return adult+[cond(t,'residence','공고일 제주 거주',eq('residence','제주특별자치도'),[1887,2031,2292],docs=['주민등록표등본·초본']),
       cond(t,'overseas','해외체류 이력은 별도 심사',eq('overseasClear'),[216,217,218,219,1080],'<표2> 지역우선 공급기준',review=True,docs=['출입국에 관한 사실증명']),
       cond(t,'exceptions','혼인·출산·배우자·군인 등 특례 미적용',eq('exceptionsClear'),[243,244,1099,2293],review=True),
       cond(t,'childbirth','출산가구 완화·태아·입양은 추가 확인',eq('childbirthClear'),[1339,2099,2359],'<표3-1> / <표4-1> / <표5-1>',review=True,docs=['가족관계증명서']),
       cond(t,'restrictions','특별공급 제한 없음',eq('noSpecialRestriction'),[2021,2022],review=True),
       cond(t,'specialHistory','특별공급 당첨 이력 없음(특례 별도)',eq('noSpecialSupplyHistory'),[2022,2276],review=True),
       cond(t,'reWinning','재당첨 제한 없음(당첨일 일정은 확인 필요)',eq('noReWinningRestriction'),[276],review=True),
       cond(t,'account','입주자저축 보유 및 종류',all_(eq('hasAccount'),eq('accountKindEligible')),[1889,2035,2294]+([1849,4107] if t=='newlywed' else []),review=t=='newlywed',docs=['청약통장 순위확인서']),
       cond(t,'months','통장 가입 6개월 경과',ge('accountMonths',6),[1889,2035,2683]),
       cond(t,'payments','납입인정 6회 이상',ge('recognizedPaymentCount',6),[1889,2035,2683])]
def rscores(t,st,table):
    if t=='youth':
        ids=list(range(1919,1931)) if st=='PRIORITY' else list(range(1968,1980))
        payment=list(range(1931,1940)) if st=='PRIORITY' else list(range(1980,1989))
    else:
        ids=list(range(2121,2133)) if st=='PRIORITY' else list(range(2224,2236))
        payment=list(range(2134,2143)) if st=='PRIORITY' else list(range(2237,2246))
    return [score(t,st,'residenceScore','제주 연속거주기간(개월)','residenceMonths',bands((0,11,1),(12,23,2),(24,None,3)),ids,table),
            score(t,st,'paymentScore','청약 납입인정횟수(회)','recognizedPaymentCount',bands((6,11,1),(12,23,2),(24,None,3)),payment,table)]
supplies=[]
t='youth'; eligibility=common(t)+[
 cond(t,'age','만 19~39세',all_(ge('age',19),le('age',39)),[1888]),
 cond(t,'single','혼인 중이 아님',eq('maritalStatus','single'),[1888],docs=['혼인관계증명서']),
 cond(t,'housing','현재 무주택 및 과거 주택소유 없음',all_(eq('noHome'),eq('neverOwned')),[1888]),
 cond(t,'assets','본인 자산 276백만원 이하',le('totalAssets',276000000),[1216,1217],'<표3> 총자산 보유기준',docs=['자산 보유 사실확인서','개인정보 수집·이용 및 제3자 제공동의서(본인·부·모)']),
 cond(t,'parentAssets','부모 자산 1,034백만원 이하',le('parentAssets',1034000000),[1218,1219],'<표3> 총자산 보유기준'),
 cond(t,'income','본인 소득 140% 이하: 5,338,708원',le('monthlyIncome',5338708),[1336,1337],'<표4> 청년 소득기준',docs=['소득금액증명'])]
stages=[]
for st,table in [('PRIORITY','<표7> 청년 특별공급 우선공급 가점표'),('GENERAL','<표8> 청년 특별공급 일반공급 가점표')]:
    conditions=[cond(t,'target','근로·자영업(과거 1년 납세 포함), 소득세 5년 이상',all_(eq('workOrBusinessIncome'),ge('incomeTaxPaymentYears',5)),[1903,1904],stage=st,docs=['<표14> 자격 및 소득세 납부 입증서류'])] if st=='PRIORITY' else []
    scores=[score(t,st,'incomeScore','본인 월평균소득(원)','monthlyIncome',bands((0,2669354,3),(2669355,3813363,2),(3813364,None,1)),[1911,1912,1913,1915,1916,1917,1918,1946,1948,1950],table)]+rscores(t,st,table)
    if st=='GENERAL': scores.append(score(t,st,'taxScore','소득세 납부기간(년)','incomeTaxPaymentYears',bands((0,0,0),(1,2,1),(3,4,2),(5,None,3)),list(range(1989,2000)),table))
    stages.append({'stage':st,'conditions':conditions,'scores':scores})
supplies.append({'type':t,'eligibility':eligibility,'stages':stages})

married=all_(eq('familyCategory','married'),eq('maritalStatus','married'))
engaged=all_(eq('familyCategory','engaged'),eq('maritalStatus','single'),eq('plannedMarriageWithinDeadline'))
parent=all_(eq('familyCategory','singleParent'),eq('maritalStatus','single'),eq('singleParentQualified'))
t='newlywed'; eligibility=common(t)+[
 cond(t,'family','혼인 7년 이내 또는 만 7세 미만 자녀 / 예비신혼 / 한부모',any_(all_(married,any_(eq('marriageWithin7Years'),eq('hasChildUnder7'))),engaged,all_(parent,eq('hasChildUnder7'))),[2032,2033,2034],docs=['혼인관계증명서','가족관계증명서']),
 cond(t,'housing','무주택세대구성원(예비신혼은 구성할 세대)',eq('householdNoHome'),[2032],review=True),
 cond(t,'size','소득표 산정 가구원수 8인 이하(9인 이상 추가 확인)',all_(ge('incomeHouseholdSize',3),le('incomeHouseholdSize',8)),[2041,2042,2043,2044,2045,2046],review=True),
 cond(t,'assets','세대 총자산 362백만원 이하',le('totalAssets',362000000),[1216],'<표3> 총자산 보유기준',docs=['자산 보유 사실확인서','금융정보 등 제공 동의서']),
 cond(t,'income','소득 외벌이 130% / 맞벌이 200% 이하',limit('130','200'),[2038],'<표5> 소득기준',docs=['소득금액증명'])]
priority=any_(all_(married,any_(eq('marriageWithin2Years'),eq('hasChildUnder3'))),engaged,all_(parent,eq('hasChildUnder3')))
st='PRIORITY'; table='<표9> 신혼부부 특별공급 우선공급 가점표'
stages=[{'stage':st,'conditions':[cond(t,'target','혼인 2년 이내·만 3세 미만 자녀·예비신혼 우선대상',priority,[2104],stage=st),cond(t,'income','우선공급 소득: 외벌이 130% / 맞벌이 140%',limit('130','140'),[2104],'<표5>',st)],
 'scores':[score(t,st,'incomeScore','세대 소득구간(0: 낮음 / 1: 중간 / 2: 상위)','householdIncomeScoreTier',bands((0,0,3),(1,1,2),(2,2,1)),list(range(2111,2121))+[2153,2160,2168,2175],table)]+rscores(t,st,table)}]
st='GENERAL'; table='<표10> 신혼부부 특별공급 일반공급 가점표'
stages.append({'stage':st,'conditions':[cond(t,'income','일반공급 소득: 외벌이 130% / 맞벌이 140%',limit('130','140'),[2198],'<표5>',st)],'scores':[
 score(t,st,'childrenScore','미성년 자녀 수(명)','minorChildren',bands((0,0,0),(1,1,1),(2,2,2),(3,None,3)),list(range(2205,2213))+[2247],table),
 score(t,st,'noHomeScore','계산된 무주택기간(개월, -1: 산정 대상 아님)','calculatedNoHomeMonths',bands((-1,-1,0),(0,11,1),(12,35,2),(36,None,3)),list(range(2213,2224))+list(range(2252,2262)),table)]+rscores(t,st,table)})
stages.append({'stage':'LOTTERY','conditions':[],'scores':None})
supplies.append({'type':t,'eligibility':eligibility,'stages':stages})

t='firstHome'; eligibility=common(t)+[
 cond(t,'housing','본인·세대 무주택 및 과거소유 없음(배우자 예외 별도)',all_(eq('householdNoHome'),eq('neverOwned'),eq('householdNeverOwned')),[2293],review=True),
 cond(t,'rank','청약통장 1순위 확인',eq('firstRank'),[2294],docs=['청약통장 순위확인서']),
 cond(t,'head','표12 1순위: 세대주',eq('isHouseholdHead'),[2684],'<표12> 일반공급 순위별 자격요건'),
 cond(t,'fiveYears','표12 1순위: 세대 전원 과거 5년 당첨 없음',eq('householdNoWinningFiveYears'),[2685],'<표12> 일반공급 순위별 자격요건',review=True),
 cond(t,'deposit','선납 포함 저축액 600만원 이상',ge('recognizedDepositAmount',6000000),[2294]),
 cond(t,'family','혼인 중 또는 동일 등본의 미혼 자녀',any_(eq('maritalStatus','married'),all_(eq('hasChildren'),eq('unmarriedChildInHousehold'))),[2296]),
 cond(t,'household','1인 가구 신청 불가 문구는 검토 메모 확인 필요',ge('householdMemberCount',2),[2297,4108],review=True),
 cond(t,'tax','근로·사업 요건 및 본인 소득세 5년 이상',all_(eq('workOrBusinessIncome'),ge('incomeTaxPaymentYears',5)),[2298,2299],docs=['<표14> 자격 및 소득세 납부 입증서류']),
 cond(t,'size','소득표 산정 가구원수 8인 이하(9인 이상 추가 확인)',all_(ge('incomeHouseholdSize',3),le('incomeHouseholdSize',8)),[2304,2305,2306,2307,2308,2309],review=True),
 cond(t,'assets','세대 총자산 362백만원 이하',le('totalAssets',362000000),[1216],'<표3> 총자산 보유기준',docs=['자산 보유 사실확인서']),
 cond(t,'income','소득 외벌이 130% / 맞벌이 200% 이하',limit('130','200'),[2301],'<표5> 소득기준')]
stages=[]
for st,single,dual,index in [('PRIORITY','100','120',2364),('GENERAL','130','140',2367),('LOTTERY','130','200',2370)]:
    stages.append({'stage':st,'conditions':[cond(t,'income',f'소득 외벌이 {single}% / 맞벌이 {dual}% 이하',limit(single,dual),[index],'<표5> 소득기준',st)],'scores':None})
supplies.append({'type':t,'eligibility':eligibility,'stages':stages})
package={'schemaVersion':1,'announcement':{'id':A,'source':'LOCAL_DRAFT','externalId':'samdo-1-2026-ver1.7','housingManagementNumber':None,
 'title':'삼도이동 1지구 토지임대부 공공분양주택','publisher':'제주특별자치도개발공사','announcementDate':'2026-09-14','regionCode':None,'regionName':'제주특별자치도','sourceUrl':None},
 'document':{'id':D,'documentType':'DRAFT','storagePath':f'2026/{A}/{D}/original.hwp','fileName':source['fileName'],'mimeType':'application/x-hwp','versionLabel':'VER1.7','sha256':SHA,'isOfficial':False,'sourceUrl':None,'publishedAt':None},
 'ruleSet':{'id':S,'version':'VER1.7-draft-transcription-1','sourceStatus':'DRAFT_SOURCE_VERIFIED','effectiveDate':'2026-09-14','config':{'parameters':params,'supplies':supplies}},'rules':rows}
out=root/'data/assessment-rules/samdo-2026-v1.7.json'; out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'{len(rows)} rules written, DRAFT_SOURCE_VERIFIED; management mapping unresolved')
